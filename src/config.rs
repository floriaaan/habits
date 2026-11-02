use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::PathBuf,
};

#[derive(Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub database_path: PathBuf,
    pub log_filter: String,
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
        if get("AUTH_MODE").is_some_and(|mode| mode != "disabled") {
            return Err(ConfigError(
                "only AUTH_MODE=disabled is supported; all private requests are refused",
            ));
        }
        for name in [
            "OIDC_ISSUER",
            "OIDC_AUDIENCE",
            "OIDC_JWKS_URL",
            "OIDC_ALLOWED_ALGORITHMS",
            "OIDC_ACCESS_TOKEN_TYP",
        ] {
            if get(name).is_some_and(|value| !value.is_empty()) {
                return Err(ConfigError(
                    "OIDC is not implemented; see docs/auth.md before enabling a provider",
                ));
            }
        }
        Ok(Self {
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
        ] {
            assert!(
                Config::from_lookup(|name| (name == key).then(|| value.into())).is_err(),
                "{key}"
            );
        }
    }
}
