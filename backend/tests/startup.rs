#![allow(clippy::unwrap_used)]

use std::{
    fs::File,
    net::TcpListener,
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

struct Server(Child);

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

async fn start(directory: &Path, mode: &str, logs: &str) -> (Server, String) {
    let socket = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    drop(socket);
    let output = File::create(directory.join(logs)).unwrap();
    let mut command = Command::new(env!("CARGO_BIN_EXE_habit-tracker"));
    command
        .env_clear()
        .env("DATABASE_PATH", directory.join("habits.sqlite"))
        .env("LISTEN_ADDR", address.to_string())
        .env("AUTH_MODE", mode)
        .env("RUST_LOG", "error")
        .stdout(Stdio::from(output.try_clone().unwrap()))
        .stderr(Stdio::from(output));
    if mode == "oidc" {
        command.envs([
            ("OIDC_ISSUER", "https://issuer.invalid"),
            ("OIDC_AUDIENCE", "test-api"),
            ("OIDC_JWKS_URL", "https://issuer.invalid/jwks"),
            ("OIDC_ALLOWED_ALGORITHMS", "RS256"),
            ("OIDC_ACCESS_TOKEN_TYP", "at+jwt"),
        ]);
    }
    let mut server = Server(command.spawn().unwrap());
    let url = format!("http://{address}");
    let client = client();
    for _ in 0..100 {
        assert!(server.0.try_wait().unwrap().is_none(), "server exited");
        if client
            .get(format!("{url}/health/ready"))
            .send()
            .await
            .is_ok_and(|response| response.status().is_success())
        {
            return (server, url);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("isolated server did not become ready");
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap()
}

#[tokio::test]
async fn local_startup_prints_one_working_token_and_restart_does_not_print_it() {
    let directory = tempfile::tempdir().unwrap();
    let (server, url) = start(directory.path(), "local", "first.log").await;
    let log = std::fs::read_to_string(directory.path().join("first.log")).unwrap();
    let events: Vec<serde_json::Value> = log
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter(|line| line["event"] == "local_bootstrap")
        .collect();
    assert_eq!(events.len(), 1);
    let token = events[0]["token"].as_str().unwrap();
    let endpoint = format!("{url}/api/v1/habits");
    assert_eq!(client().get(&endpoint).send().await.unwrap().status(), 401);
    assert_eq!(
        client()
            .get(&endpoint)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    drop(server);
    let (_restarted, url) = start(directory.path(), "tokens", "restart.log").await;
    let log = std::fs::read_to_string(directory.path().join("restart.log")).unwrap();
    assert!(!log.contains("local_bootstrap") && !log.contains(token));
    assert_eq!(
        client()
            .get(format!("{url}/api/v1/habits"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
}

#[tokio::test]
async fn disabled_and_oidc_startup_do_not_bootstrap_a_local_administrator() {
    for mode in ["disabled", "oidc"] {
        let directory = tempfile::tempdir().unwrap();
        let (_server, url) = start(directory.path(), mode, "server.log").await;
        let log = std::fs::read_to_string(directory.path().join("server.log")).unwrap();
        assert!(!log.contains("local_bootstrap") && !log.contains("ht_"));
        assert_eq!(
            client()
                .get(format!("{url}/api/v1/habits"))
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        // A healthcheck invoked with local auth must not bootstrap the shared DB.
        let health = Command::new(env!("CARGO_BIN_EXE_habit-tracker"))
            .env_clear()
            .env("AUTH_MODE", "local")
            .env("DATABASE_PATH", directory.path().join("habits.sqlite"))
            .env("LISTEN_ADDR", url.trim_start_matches("http://"))
            .arg("healthcheck")
            .output()
            .unwrap();
        assert!(health.status.success() && health.stdout.is_empty());
        let pool = sqlx::SqlitePool::connect(&format!(
            "sqlite://{}",
            directory.path().join("habits.sqlite").display()
        ))
        .await
        .unwrap();
        let tokens: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM access_tokens")
            .fetch_one(&pool)
            .await
            .unwrap();
        let admins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE is_admin = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((tokens, admins), (0, 0));
        pool.close().await;
    }
}
