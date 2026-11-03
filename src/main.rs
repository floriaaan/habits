use habit_tracker::{
    config::{AuthMode, Config},
    http::routes::{ApiDoc, router_with_identity},
    infrastructure::database::Store,
};
use std::{error::Error, path::Path};
use tracing_subscriber::EnvFilter;
use utoipa::OpenApi;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments.as_slice() == ["openapi"] {
        println!("{}", ApiDoc::openapi().to_pretty_json()?);
        return Ok(());
    }
    let config = Config::from_env()?;
    if arguments.as_slice() == ["healthcheck"] {
        let address = config.healthcheck_addr();
        reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(3))
            .build()?
            .get(format!("http://{address}/health/ready"))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    let valid = arguments.is_empty()
        || (arguments.len() == 2 && arguments[0] == "bootstrap-local")
        || (arguments.len() == 2 && arguments[0] == "backup")
        || (arguments.len() == 4
            && matches!(arguments[0].as_str(), "bootstrap-admin" | "user-create"))
        || ((arguments.len() == 4 || arguments.len() == 5) && arguments[0] == "token-create");
    if !valid {
        return Err("usage: habit-tracker [openapi|healthcheck|backup DEST|bootstrap-local TIMEZONE|bootstrap-admin ISSUER SUBJECT TIMEZONE|user-create ISSUER SUBJECT TIMEZONE|token-create USER_ID SCOPES EXPIRES_AT [SERVICE_ACCOUNT_ID]]".into());
    }
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::try_new(&config.log_filter)?)
        .try_init()
        .map_err(|_| "cannot initialize tracing")?;
    if let Some(parent) = config
        .database_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let store = Store::connect(&config.database_url()).await?;
    if arguments
        .first()
        .is_some_and(|cmd| cmd == "bootstrap-local")
    {
        let token = store.bootstrap_local(&arguments[1]).await?;
        println!("{}", serde_json::to_string(&token)?);
        store.close().await;
        return Ok(());
    }
    if arguments
        .first()
        .is_some_and(|cmd| matches!(cmd.as_str(), "bootstrap-admin" | "user-create"))
    {
        use habit_tracker::modules::auth::{NewToken, Scope};
        let admin = arguments[0] == "bootstrap-admin";
        let user = store
            .create_user(&arguments[1], &arguments[2], &arguments[3], admin)
            .await?;
        if admin {
            let token = store
                .issue_local_token(
                    user,
                    NewToken {
                        scopes: Scope::all(),
                        expires_at: chrono::Utc::now() + chrono::Duration::hours(24),
                        service_account_id: None,
                    },
                )
                .await?;
            println!("{}", serde_json::to_string(&token)?);
        } else {
            println!("{}", serde_json::json!({"user_id":user}));
        }
        store.close().await;
        return Ok(());
    }
    if arguments.first().is_some_and(|cmd| cmd == "token-create") {
        use habit_tracker::modules::{auth::NewToken, users::UserId};
        let scopes = serde_json::from_value(serde_json::json!(
            arguments[2].split(',').collect::<Vec<_>>()
        ))?;
        let token = store
            .issue_local_token(
                UserId(arguments[1].parse()?),
                NewToken {
                    scopes,
                    expires_at: arguments[3].parse()?,
                    service_account_id: arguments.get(4).map(|s| s.parse()).transpose()?,
                },
            )
            .await?;
        println!("{}", serde_json::to_string(&token)?);
        store.close().await;
        return Ok(());
    }
    if arguments.len() == 2 {
        store.backup(Path::new(&arguments[1])).await?;
        store.close().await;
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    store.local_user("UTC").await?;
    let runtime =
        habit_tracker::infrastructure::integrations::IntegrationRuntime::from_env(store.clone())?;
    let oidc = if let Some(oidc) = config.oidc {
        let algorithms = oidc
            .algorithms
            .iter()
            .map(|alg| match alg.as_str() {
                "RS256" => Ok(jsonwebtoken::Algorithm::RS256),
                "ES256" => Ok(jsonwebtoken::Algorithm::ES256),
                "EdDSA" => Ok(jsonwebtoken::Algorithm::EdDSA),
                _ => Err("unsupported OIDC algorithm"),
            })
            .collect::<Result<Vec<_>, _>>()?;
        Some(std::sync::Arc::new(
            habit_tracker::infrastructure::security::oidc::OidcVerifier::new(
                habit_tracker::infrastructure::security::oidc::OidcConfig {
                    issuer: oidc.issuer,
                    audience: oidc.audience,
                    jwks_url: oidc.jwks_url.parse()?,
                    algorithms,
                },
            )?,
        ))
    } else {
        None
    };
    if config.auth_mode == AuthMode::Tokens
        && let Some(issued) = store.bootstrap_local_if_needed("UTC").await?
    {
        // Explicit one-time installation output; never log request/provider secrets.
        println!(
            "{}",
            serde_json::json!({
                "event": "local_bootstrap",
                "token": issued.token,
                "metadata": issued.metadata,
            })
        );
    }
    let worker = if runtime.ha_url.is_some() || runtime.strava.is_some() {
        Some(tokio::spawn(runtime.clone().worker()))
    } else {
        None
    };
    tracing::info!(address = %config.listen_addr, auth = ?config.auth_mode, "API listening");
    axum::serve(
        listener,
        router_with_identity(store.clone(), config.auth_mode, runtime, oidc),
    )
    .with_graceful_shutdown(shutdown())
    .await?;
    if let Some(worker) = worker {
        worker.abort();
        let _ = worker.await;
    }
    store.close().await;
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
