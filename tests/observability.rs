#![allow(clippy::unwrap_used)]
use axum::{Json, Router, extract::State, http::StatusCode, routing::post};
use serde_json::{Value, json};
use std::{
    fs::File,
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

struct Server(Child);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[derive(Clone, Default)]
struct Collector {
    records: Arc<Mutex<Vec<Value>>>,
    fail: Arc<AtomicBool>,
}
async fn collect(State(c): State<Collector>, Json(value): Json<Value>) -> StatusCode {
    if c.fail.load(Ordering::Relaxed) {
        return StatusCode::SERVICE_UNAVAILABLE;
    }
    c.records.lock().unwrap().push(value);
    StatusCode::OK
}

#[tokio::test]
async fn otlp_correlates_request_service_response_redacts_secrets_and_survives_outage() {
    let collector = Collector::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/v1/logs", listener.local_addr().unwrap());
    let task = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .route("/v1/logs", post(collect))
                .with_state(collector.clone()),
        )
        .into_future(),
    );
    let directory = tempfile::tempdir().unwrap();
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    drop(socket);
    let output = File::create(directory.path().join("server.log")).unwrap();
    let mut server = Server(
        Command::new(env!("CARGO_BIN_EXE_habit-tracker"))
            .env_clear()
            .env("DATABASE_PATH", directory.path().join("db.sqlite"))
            .env("LISTEN_ADDR", address.to_string())
            .env("AUTH_MODE", "local")
            .env("RUST_LOG", "trace")
            .env("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", endpoint)
            .env("OTEL_SERVICE_NAME", "habit-test")
            .stdout(Stdio::from(output.try_clone().unwrap()))
            .stderr(Stdio::from(output))
            .spawn()
            .unwrap(),
    );
    let url = format!("http://{address}");
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let mut ready = false;
    for _ in 0..100 {
        assert!(server.0.try_wait().unwrap().is_none());
        if client
            .get(format!("{url}/health/ready"))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
        {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(ready, "API startup failed");
    let output = std::fs::read_to_string(directory.path().join("server.log")).unwrap();
    let bootstrap: Value = output
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|v| v["event"] == "local_bootstrap")
        .unwrap();
    let token = bootstrap["token"].as_str().unwrap();
    let response=client.post(format!("{url}/api/v1/habits/setup?secret=QUERY_SECRET"))
        .bearer_auth(token).header("idempotency-key","SECRET_KEY")
        .json(&json!({"habit":{"name":"PRIVATE_HABIT_NAME","category":"mind","kind":"boolean","unit":"count","target":1,"timezone":"UTC"}})).send().await.unwrap();
    assert_eq!(response.status(), 201);
    let request_id = response.headers()["x-request-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let habit: Value = response.json().await.unwrap();
    client
        .get(format!(
            "{url}/api/v1/habits/{}",
            habit["id"].as_str().unwrap()
        ))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert_eq!(
        client
            .get(format!("{url}/api/v1/habits"))
            .bearer_auth("REJECTED_SECRET_TOKEN")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    for _ in 0..60 {
        if collector
            .records
            .lock()
            .unwrap()
            .iter()
            .any(|v| v.to_string().contains(&request_id))
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let exported = serde_json::to_string(&*collector.records.lock().unwrap()).unwrap();
    assert!(
        exported.contains(&request_id)
            && exported.contains("setup_habit")
            && exported.contains("habit-test")
    );
    assert!(exported.contains("request started") && exported.contains("request completed"));
    let batches = collector.records.lock().unwrap().clone();
    for message in [
        "request started",
        "setup habit started",
        "habit setup committed",
        "request completed",
    ] {
        let found = batches
            .iter()
            .flat_map(|b| b["resourceLogs"].as_array().unwrap())
            .flat_map(|r| r["scopeLogs"].as_array().unwrap())
            .flat_map(|scope| scope["logRecords"].as_array().unwrap())
            .any(|record| {
                record.to_string().contains(message)
                    && record["attributes"].as_array().unwrap().iter().any(|a| {
                        a["key"] == "request_id" && a["value"]["stringValue"] == request_id
                    })
            });
        assert!(found, "missing correlated event: {message}");
    }

    assert!(exported.contains("/api/v1/habits/{habit_id}"));
    for secret in [
        token,
        "PRIVATE_HABIT_NAME",
        "QUERY_SECRET",
        "SECRET_KEY",
        "REJECTED_SECRET_TOKEN",
    ] {
        assert!(!exported.contains(secret), "secret exported");
    }
    collector.fail.store(true, Ordering::Relaxed);
    for _ in 0..5 {
        assert!(
            client
                .get(format!("{url}/health/ready"))
                .send()
                .await
                .unwrap()
                .status()
                .is_success()
        );
    }
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert!(
        client
            .get(format!("{url}/api/v1/habits"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    collector.fail.store(false, Ordering::Relaxed);
    assert!(
        Command::new("kill")
            .args(["-TERM", &server.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    let mut stopped = false;
    for _ in 0..80 {
        if let Some(status) = server.0.try_wait().unwrap() {
            assert!(status.success());
            stopped = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(stopped, "graceful shutdown exceeded limit");
    let stdout = std::fs::read_to_string(directory.path().join("server.log")).unwrap();
    let normal_logs = stdout
        .lines()
        .filter(|line| !line.contains("local_bootstrap"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(normal_logs.contains(&request_id));
    for secret in [
        token,
        "PRIVATE_HABIT_NAME",
        "QUERY_SECRET",
        "SECRET_KEY",
        "REJECTED_SECRET_TOKEN",
    ] {
        assert!(!normal_logs.contains(secret), "secret logged");
    }
    task.abort();
}
