use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::PathBuf,
};

#[derive(Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub database_path: PathBuf,
    pub log_filter: String,
    pub auth_mode: AuthMode,
    pub oidc: Option<OidcSettings>,
    pub logs_endpoint: Option<String>,
    pub service_name: String,
}

#[derive(Clone)]
pub struct OidcSettings {
    pub issuer: String,
    pub audience: String,
    pub jwks_url: String,
    pub algorithms: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMode {
    Disabled,
    Tokens,
    Oidc,
    Accounts,
}

#[derive(Debug, thiserror::Error)]
#[error("invalid configuration: {0}")]
pub struct ConfigError(pub &'static str);

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let listen_addr: SocketAddr = get("LISTEN_ADDR")
            .unwrap_or_else(|| "127.0.0.1:8080".into())
            .parse()
            .map_err(|_| ConfigError("LISTEN_ADDR must be an IP:port"))?;
        if listen_addr.port() == 0 {
            return Err(ConfigError("LISTEN_ADDR port must not be zero"));
        }
        let path = get("DATABASE_PATH").unwrap_or_else(|| "data/habits.sqlite".into());
        if path.trim().is_empty() || path.contains(['?', '#', '\0']) || path == ":memory:" {
            return Err(ConfigError("DATABASE_PATH must be a local filesystem path"));
        }
        let auth_mode = match get("AUTH_MODE").as_deref().unwrap_or("disabled") {
            "disabled" => AuthMode::Disabled,
            "tokens" | "local" => AuthMode::Tokens,
            "oidc" => AuthMode::Oidc,
            "accounts" => AuthMode::Accounts,
            _ => {
                return Err(ConfigError(
                    "AUTH_MODE must be disabled, local (tokens alias), accounts or oidc",
                ));
            }
        };
        let oidc_names = [
            "OIDC_ISSUER",
            "OIDC_AUDIENCE",
            "OIDC_JWKS_URL",
            "OIDC_ALLOWED_ALGORITHMS",
            "OIDC_ACCESS_TOKEN_TYP",
        ];
        let oidc = if auth_mode == AuthMode::Oidc {
            let required = |name: &str| {
                get(name).filter(|value|!value.trim().is_empty()).ok_or(ConfigError("OIDC mode requires issuer, audience, HTTPS JWKS, allowed algorithms and access token typ=at+jwt"))
            };
            let issuer = required("OIDC_ISSUER")?;
            let audience = required("OIDC_AUDIENCE")?;
            let jwks_url = required("OIDC_JWKS_URL")?;
            let valid_url = |value: &str| {
                reqwest::Url::parse(value).is_ok_and(|url| {
                    url.scheme() == "https"
                        && url.host_str().is_some()
                        && url.username().is_empty()
                        && url.password().is_none()
                        && url.query().is_none()
                        && url.fragment().is_none()
                })
            };
            let algorithms = required("OIDC_ALLOWED_ALGORITHMS")?
                .split(',')
                .map(str::trim)
                .map(String::from)
                .collect::<Vec<_>>();
            if !valid_url(&issuer)
                || !valid_url(&jwks_url)
                || audience.len() > 255
                || audience.chars().any(char::is_control)
                || required("OIDC_ACCESS_TOKEN_TYP")? != "at+jwt"
                || algorithms.is_empty()
                || algorithms
                    .iter()
                    .any(|alg| !matches!(alg.as_str(), "RS256" | "ES256" | "EdDSA"))
            {
                return Err(ConfigError(
                    "invalid OIDC resource-server contract; only HTTPS, at+jwt and RS256/ES256/EdDSA are accepted",
                ));
            }
            Some(OidcSettings {
                issuer,
                audience,
                jwks_url,
                algorithms,
            })
        } else {
            if oidc_names
                .iter()
                .any(|name| get(name).is_some_and(|value| !value.is_empty()))
            {
                return Err(ConfigError(
                    "OIDC variables require explicit AUTH_MODE=oidc",
                ));
            }
            None
        };
        let logs_endpoint = get("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT").filter(|v| !v.is_empty());
        if let Some(endpoint) = &logs_endpoint {
            let url = reqwest::Url::parse(endpoint)
                .map_err(|_| ConfigError("invalid OTLP logs endpoint"))?;
            if !matches!(url.scheme(), "http" | "https")
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || !url.path().ends_with("/v1/logs")
            {
                return Err(ConfigError(
                    "OTLP endpoint must be HTTP(S), end in /v1/logs, and contain no credentials, query or fragment",
                ));
            }
        }
        let service_name = get("OTEL_SERVICE_NAME")
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "habit-tracker".into());
        if service_name.len() > 128 || service_name.chars().any(char::is_control) {
            return Err(ConfigError("invalid OTEL_SERVICE_NAME"));
        }
        Ok(Self {
            logs_endpoint,
            service_name,
            auth_mode,
            oidc,
            listen_addr,
            database_path: path.into(),
            log_filter: get("RUST_LOG")
                .unwrap_or_else(|| "habit_tracker=info,tower_http=info".into()),
        })
    }

    pub fn database_url(&self) -> String {
        format!("sqlite://{}", self.database_path.display())
    }

    pub fn healthcheck_addr(&self) -> SocketAddr {
        let ip = match self.listen_addr.ip() {
            IpAddr::V4(ip) if ip.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V6(ip) if ip.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
            ip => ip,
        };
        SocketAddr::new(ip, self.listen_addr.port())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn healthcheck_keeps_the_configured_address_family() {
        for (listen, health) in [
            ("0.0.0.0:8080", "127.0.0.1:8080"),
            ("[::]:8080", "[::1]:8080"),
            ("127.0.0.2:8080", "127.0.0.2:8080"),
        ] {
            let config = Config::from_lookup(|name| (name == "LISTEN_ADDR").then(|| listen.into()));
            assert_eq!(
                config
                    .map(|config| config.healthcheck_addr().to_string())
                    .ok()
                    .as_deref(),
                Some(health)
            );
        }
    }
    #[test]
    fn validates_without_mutating_process_environment() {
        assert!(Config::from_lookup(|_| None).is_ok());
        for (key, value) in [
            ("LISTEN_ADDR", "bad"),
            ("LISTEN_ADDR", "0.0.0.0:0"),
            ("DATABASE_PATH", ""),
            ("DATABASE_PATH", ":memory:"),
            ("AUTH_MODE", "test"),
            ("AUTH_MODE", "oidc"),
            ("OIDC_AUDIENCE", "unconfirmed"),
            ("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "http://collector:4318"),
            (
                "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
                "https://user:secret@collector/v1/logs",
            ),
            (
                "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
                "https://collector/v1/logs?token=secret",
            ),
            ("OTEL_SERVICE_NAME", "bad\nname"),
        ] {
            assert!(
                Config::from_lookup(|name| (name == key).then(|| value.into())).is_err(),
                "{key}"
            );
        }
    }
}
