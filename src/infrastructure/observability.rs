//! Optional bounded OTLP log export. All request secrets stay outside tracing.
use crate::config::{Config, ConfigError};
use opentelemetry::KeyValue;
use opentelemetry_appender_tracing::layer::{OpenTelemetryTracingBridge, TracingSpanAttributes};
use opentelemetry_otlp::{Protocol, WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::{
    Resource,
    logs::{BatchConfigBuilder, BatchLogProcessor, SdkLoggerProvider},
};
use std::time::Duration;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub struct Logging(Option<SdkLoggerProvider>);

impl Drop for Logging {
    fn drop(&mut self) {
        if let Some(provider) = self.0.take()
            && provider
                .shutdown_with_timeout(Duration::from_secs(5))
                .is_err()
        {
            eprintln!("OTLP log exporter shutdown did not complete; console logs remain available");
        }
    }
}

pub async fn init(config: &Config) -> Result<Logging, ConfigError> {
    let endpoint = config.logs_endpoint.clone();
    let name = config.service_name.clone();
    let provider = if let Some(endpoint) = endpoint {
        // The SDK uses its own worker thread and a blocking HTTP client.
        Some(
            tokio::task::spawn_blocking(move || {
                let client = reqwest::blocking::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .timeout(Duration::from_secs(3))
                    .build()
                    .map_err(|_| ConfigError("cannot initialize OTLP HTTP client"))?;
                let exporter = opentelemetry_otlp::LogExporter::builder()
                    .with_http()
                    .with_protocol(Protocol::HttpJson)
                    .with_endpoint(endpoint)
                    .with_timeout(Duration::from_secs(3))
                    .with_http_client(client)
                    .build()
                    .map_err(|_| ConfigError("cannot initialize OTLP exporter"))?;
                let batch = BatchConfigBuilder::default()
                    .with_max_queue_size(2048)
                    .with_max_export_batch_size(256)
                    .with_scheduled_delay(Duration::from_secs(1))
                    .build();
                Ok::<_, ConfigError>(
                    SdkLoggerProvider::builder()
                        .with_resource(
                            Resource::builder()
                                .with_service_name(name)
                                .with_attribute(KeyValue::new(
                                    "service.version",
                                    env!("CARGO_PKG_VERSION"),
                                ))
                                .build(),
                        )
                        .with_log_processor(
                            BatchLogProcessor::builder(exporter)
                                .with_batch_config(batch)
                                .build(),
                        )
                        .build(),
                )
            })
            .await
            .map_err(|_| ConfigError("cannot start OTLP exporter"))??,
        )
    } else {
        None
    };
    let bridge = provider.as_ref().map(|p| {
        OpenTelemetryTracingBridge::builder(p)
            .with_tracing_span_attributes(TracingSpanAttributes::allowlist([
                "request_id",
                "method",
                "route",
                "user_id",
                "operation",
                "job_id",
            ]))
            .build()
    });
    tracing_subscriber::registry()
        .with(EnvFilter::try_new(format!("{},sqlx=off,reqwest=off,hyper=off,opentelemetry=off,opentelemetry_sdk=off,opentelemetry_otlp=off", config.log_filter)).map_err(|_| ConfigError("invalid RUST_LOG"))?)
        .with(tracing_subscriber::fmt::layer().json())
        .with(bridge)
        .try_init()
        .map_err(|_| ConfigError("cannot initialize tracing"))?;
    tracing::info!(
        otlp_enabled = provider.is_some(),
        "structured logging initialized"
    );
    Ok(Logging(provider))
}
