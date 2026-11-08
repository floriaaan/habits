//! Strict JWT access-token resource-server verification against configured JWKS.
use crate::modules::{DomainError, auth::Scope};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{
    Algorithm, DecodingKey, Validation, decode, decode_header,
    jwk::{AlgorithmParameters, EllipticCurve, JwkSet, KeyOperations, PublicKeyUse},
};
use reqwest::Url;
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const CACHE_TTL: Duration = Duration::from_secs(300);
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const MAX_JWKS_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct OidcConfig {
    pub issuer: String,
    pub audience: String,
    pub jwks_url: Url,
    pub algorithms: Vec<Algorithm>,
}

#[derive(Debug)]
pub struct VerifiedIdentity {
    pub issuer: String,
    pub subject: String,
    pub scopes: Vec<Scope>,
}

#[derive(Clone)]
struct CachedKey {
    algorithm: Algorithm,
    key: DecodingKey,
}

#[derive(Default)]
struct Cache {
    keys: BTreeMap<String, CachedKey>,
    fetched_at: Option<Instant>,
    attempted_at: Option<Instant>,
}

pub struct OidcVerifier {
    config: OidcConfig,
    client: reqwest::Client,
    cache: Mutex<Cache>,
}

#[derive(Deserialize)]
struct Claims {
    iss: String,
    sub: String,
    exp: u64,
    nbf: u64,
    scope: Option<String>,
}

fn valid_kid(kid: &str) -> bool {
    !kid.is_empty() && kid.len() <= 128 && !kid.chars().any(char::is_control)
}

impl OidcVerifier {
    pub fn new(config: OidcConfig) -> Result<Self, DomainError> {
        Self::build(config, false)
    }

    fn build(config: OidcConfig, test_loopback: bool) -> Result<Self, DomainError> {
        let issuer = Url::parse(&config.issuer)
            .map_err(|_| DomainError::Validation("OIDC issuer must be an HTTPS URL"))?;
        let clean = |url: &Url| {
            url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none()
        };
        let loopback = config
            .jwks_url
            .host_str()
            .and_then(|host| host.parse::<std::net::IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if issuer.scheme() != "https"
            || !clean(&issuer)
            || issuer.query().is_some()
            || !clean(&config.jwks_url)
            || (config.jwks_url.scheme() != "https"
                && !(test_loopback && loopback && config.jwks_url.scheme() == "http"))
            || config.audience.is_empty()
            || config.audience.len() > 255
            || config.audience.chars().any(char::is_control)
            || config.algorithms.is_empty()
            || config.algorithms.len() > 3
            || config.algorithms.iter().enumerate().any(|(i, alg)| {
                !matches!(alg, Algorithm::RS256 | Algorithm::ES256 | Algorithm::EdDSA)
                    || config.algorithms[..i].contains(alg)
            })
        {
            return Err(DomainError::Validation(
                "OIDC requires a valid issuer, audience, HTTPS JWKS URL and distinct RS256/ES256/EdDSA algorithms",
            ));
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .https_only(!test_loopback)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| DomainError::Unavailable)?;
        Ok(Self {
            config,
            client,
            cache: Mutex::new(Cache::default()),
        })
    }

    // Loopback HTTP is compiled exclusively into tests, never configured by env.
    #[cfg(test)]
    fn new_for_test(config: OidcConfig) -> Result<Self, DomainError> {
        Self::build(config, true)
    }

    async fn fetch_keys(&self) -> Result<BTreeMap<String, CachedKey>, DomainError> {
        let mut response = self
            .client
            .get(self.config.jwks_url.clone())
            .send()
            .await
            .map_err(|_| DomainError::Unavailable)?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_JWKS_BYTES as u64)
        {
            return Err(DomainError::Unavailable);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| DomainError::Unavailable)?
        {
            if bytes.len() + chunk.len() > MAX_JWKS_BYTES {
                return Err(DomainError::Unavailable);
            }
            bytes.extend_from_slice(&chunk);
        }
        let jwks: JwkSet = serde_json::from_slice(&bytes).map_err(|_| DomainError::Unavailable)?;
        if jwks.keys.is_empty() || jwks.keys.len() > 64 {
            return Err(DomainError::Unavailable);
        }
        let mut keys = BTreeMap::new();
        for jwk in jwks.keys {
            if jwk.common.public_key_use != Some(PublicKeyUse::Signature)
                || jwk
                    .common
                    .key_operations
                    .as_ref()
                    .is_some_and(|operations| !operations.contains(&KeyOperations::Verify))
            {
                continue;
            }
            let Some(kid) = jwk.common.key_id.as_deref().filter(|kid| valid_kid(kid)) else {
                continue;
            };
            let Some(algorithm) = jwk
                .common
                .key_algorithm
                .and_then(|algorithm| algorithm.to_string().parse::<Algorithm>().ok())
            else {
                continue;
            };
            if !self.config.algorithms.contains(&algorithm) {
                continue;
            }
            let compatible = match (&jwk.algorithm, algorithm) {
                (AlgorithmParameters::RSA(parameters), Algorithm::RS256) => URL_SAFE_NO_PAD
                    .decode(&parameters.n)
                    .is_ok_and(|n| (256..=1024).contains(&n.len())),
                (AlgorithmParameters::EllipticCurve(parameters), Algorithm::ES256) => {
                    parameters.curve == EllipticCurve::P256
                }
                (AlgorithmParameters::OctetKeyPair(parameters), Algorithm::EdDSA) => {
                    parameters.curve == EllipticCurve::Ed25519
                }
                _ => false,
            };
            if !compatible {
                continue;
            }
            let key = DecodingKey::from_jwk(&jwk).map_err(|_| DomainError::Unavailable)?;
            if keys
                .insert(kid.to_owned(), CachedKey { algorithm, key })
                .is_some()
            {
                return Err(DomainError::Unavailable);
            }
        }
        if keys.is_empty() {
            return Err(DomainError::Unavailable);
        }
        Ok(keys)
    }

    async fn key(&self, kid: &str, algorithm: Algorithm) -> Result<DecodingKey, DomainError> {
        // Holding this async lock across refresh makes concurrent misses single-flight.
        let mut cache = self.cache.lock().await;
        let fresh = cache.fetched_at.is_some_and(|at| at.elapsed() < CACHE_TTL);
        if fresh && let Some(key) = cache.keys.get(kid) {
            return if key.algorithm == algorithm {
                Ok(key.key.clone())
            } else {
                Err(DomainError::Unauthenticated)
            };
        }
        if cache
            .attempted_at
            .is_some_and(|at| at.elapsed() < REFRESH_INTERVAL)
        {
            return Err(if fresh {
                DomainError::Unauthenticated
            } else {
                DomainError::Unavailable
            });
        }
        cache.attempted_at = Some(Instant::now());
        cache.keys = self.fetch_keys().await?;
        cache.fetched_at = Some(Instant::now());
        cache
            .keys
            .get(kid)
            .filter(|key| key.algorithm == algorithm)
            .map(|key| key.key.clone())
            .ok_or(DomainError::Unauthenticated)
    }

    pub async fn verify(&self, token: &str) -> Result<VerifiedIdentity, DomainError> {
        if token.is_empty() || token.len() > 8192 {
            return Err(DomainError::Unauthenticated);
        }
        let header = decode_header(token).map_err(|_| DomainError::Unauthenticated)?;
        if header.typ.as_deref() != Some("at+jwt")
            || !self.config.algorithms.contains(&header.alg)
            || header.crit.as_ref().is_some_and(|crit| !crit.is_empty())
            || header.jku.is_some()
            || header.jwk.is_some()
            || header.x5u.is_some()
            || header.enc.is_some()
            || header.zip.is_some()
        {
            return Err(DomainError::Unauthenticated);
        }
        let kid = header
            .kid
            .as_deref()
            .filter(|kid| valid_kid(kid))
            .ok_or(DomainError::Unauthenticated)?;
        let key = self.key(kid, header.alg).await?;
        let mut validation = Validation::new(header.alg);
        validation.set_issuer(&[self.config.issuer.as_str()]);
        validation.set_audience(&[self.config.audience.as_str()]);
        validation.set_required_spec_claims(&["iss", "aud", "sub", "exp", "nbf"]);
        validation.validate_exp = true;
        validation.validate_nbf = true;
        validation.validate_aud = true;
        validation.leeway = 30;
        let claims = decode::<Claims>(token, &key, &validation)
            .map_err(|_| DomainError::Unauthenticated)?
            .claims;
        if claims.sub.is_empty()
            || claims.sub.len() > 255
            || claims.sub.chars().any(char::is_control)
            || claims.nbf > claims.exp
        {
            return Err(DomainError::Unauthenticated);
        }
        let mut scopes = Vec::new();
        for scope in claims
            .scope
            .as_deref()
            .unwrap_or("")
            .split_ascii_whitespace()
        {
            if let Ok(scope) =
                serde_json::from_value::<Scope>(serde_json::Value::String(scope.to_owned()))
                && !scopes.contains(&scope)
            {
                scopes.push(scope);
            }
        }
        Ok(VerifiedIdentity {
            issuer: claims.iss,
            subject: claims.sub,
            scopes,
        })
    }
}

#[cfg(test)]
#[path = "oidc_tests.rs"]
mod tests;
