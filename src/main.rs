use habit_tracker::{
    config::Config,
    http::routes::{ApiDoc, router},
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
    if !arguments.is_empty() && !(arguments.len() == 2 && arguments[0] == "backup") {
        return Err("usage: habit-tracker [openapi|healthcheck|backup DESTINATION]".into());
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
    if arguments.len() == 2 {
        store.backup(Path::new(&arguments[1])).await?;
        store.close().await;
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    tracing::info!(address = %config.listen_addr, auth = "disabled_fail_closed", "API listening");
    axum::serve(listener, router(store.clone()))
        .with_graceful_shutdown(shutdown())
        .await?;
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
