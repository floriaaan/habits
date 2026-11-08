use super::{
    middleware::{ApiError, TrafficBudget, boundary},
    routes::json,
};
use crate::{
    infrastructure::{database::Store, security::account_mail::AccountMail},
    modules::auth::accounts::*,
};
use axum::{
    Extension, Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{StatusCode, header},
    middleware,
    response::Response,
    routing::post,
};
use std::sync::Arc;

pub fn router(store: Store, mail: Option<AccountMail>) -> Router {
    Router::new()
        .route("/api/v1/auth/register", post(register))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/forgot-password", post(forgot))
        .route("/api/v1/auth/reset-password", post(reset))
        .route("/api/v1/auth/refresh", post(refresh))
        .route("/api/v1/auth/logout", post(logout))
        .with_state(store)
        .layer(Extension(mail.map(Arc::new)))
        .layer(DefaultBodyLimit::max(4096))
        .layer(middleware::from_fn_with_state(
            TrafficBudget::default(),
            boundary,
        ))
        .layer(middleware::map_response(
            |mut response: Response| async move {
                response.headers_mut().insert(
                    header::CACHE_CONTROL,
                    header::HeaderValue::from_static("no-store"),
                );
                response
            },
        ))
}
async fn budget(store: &Store, key: &str, limit: i64) -> Result<(), ApiError> {
    if !store.account_budget("auth:global", 300).await? || !store.account_budget(key, limit).await?
    {
        return Err(ApiError::status(StatusCode::TOO_MANY_REQUESTS));
    }
    Ok(())
}
async fn challenge(
    store: &Store,
    mail: Option<&AccountMail>,
    address: &str,
    purpose: &str,
) -> Result<(), ApiError> {
    let mail = mail.ok_or(crate::modules::DomainError::Unavailable)?;
    if let Some(code) = store.account_challenge(address, purpose).await? {
        mail.send(address, &code).await?;
    }
    Ok(())
}
#[utoipa::path(post,path="/api/v1/auth/register",request_body=AccountCredentials,responses((status=204),(status=422),(status=429),(status=503)))]
pub(super) async fn register(
    State(store): State<Store>,
    body: Result<Json<AccountCredentials>, axum::extract::rejection::JsonRejection>,
) -> Result<StatusCode, ApiError> {
    let input = json(body)?;
    let address = email(&input.email)?;
    budget(&store, &format!("mail:{address}"), 5).await?;
    store.register_account(input).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/auth/login",request_body=AccountCredentials,responses((status=200,body=MobileTokens),(status=401),(status=429)))]
pub(super) async fn login(
    State(store): State<Store>,
    body: Result<Json<AccountCredentials>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<MobileTokens>, ApiError> {
    let input = json(body)?;
    let address = email(&input.email)?;
    budget(&store, &format!("login:{address}"), 10).await?;
    if input.password.len() > 1024 {
        return Err(ApiError::status(StatusCode::UNAUTHORIZED));
    }
    Ok(Json(store.login_account(&address, input.password).await?))
}
#[utoipa::path(post,path="/api/v1/auth/forgot-password",request_body=EmailRequest,responses((status=204),(status=429),(status=503)))]
pub(super) async fn forgot(
    State(store): State<Store>,
    Extension(mail): Extension<Option<Arc<AccountMail>>>,
    body: Result<Json<EmailRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<StatusCode, ApiError> {
    send_challenge(store, mail, json(body)?, "reset").await
}
async fn send_challenge(
    store: Store,
    mail: Option<Arc<AccountMail>>,
    input: EmailRequest,
    purpose: &str,
) -> Result<StatusCode, ApiError> {
    let address = email(&input.email)?;
    budget(&store, &format!("mail:{address}"), 5).await?;
    challenge(&store, mail.as_deref(), &address, purpose).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/auth/reset-password",request_body=ResetRequest,responses((status=204),(status=422),(status=429)))]
pub(super) async fn reset(
    State(store): State<Store>,
    body: Result<Json<ResetRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<StatusCode, ApiError> {
    let input = json(body)?;
    let address = email(&input.email)?;
    budget(&store, &format!("code:{address}"), 15).await?;
    store
        .reset_account(&address, &input.code, input.password)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/auth/refresh",request_body=RefreshRequest,responses((status=200,body=MobileTokens),(status=401),(status=429)))]
pub(super) async fn refresh(
    State(store): State<Store>,
    body: Result<Json<RefreshRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<MobileTokens>, ApiError> {
    let input = json(body)?;
    budget(&store, "refresh:global", 300).await?;
    Ok(Json(store.refresh_mobile(&input.refresh_token).await?))
}
#[utoipa::path(post,path="/api/v1/auth/logout",request_body=RefreshRequest,responses((status=204),(status=429)))]
pub(super) async fn logout(
    State(store): State<Store>,
    body: Result<Json<RefreshRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<StatusCode, ApiError> {
    let input = json(body)?;
    budget(&store, "logout:global", 300).await?;
    store.logout_mobile(&input.refresh_token).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    #[tokio::test]
    async fn email_login_authenticates_business_routes_and_logout_revokes_rotated_session() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::connect(&format!(
            "sqlite://{}",
            dir.path().join("auth.sqlite").display()
        ))
        .await
        .unwrap();
        let app = super::super::routes::router_with_auth(
            store.clone(),
            crate::config::AuthMode::Accounts,
        )
        .merge(router(store, None));
        let response=app.clone().oneshot(Request::builder().method("POST").uri("/api/v1/auth/register").header("Content-Type","application/json").body(Body::from(r#"{"email":"person@example.fr","password":"long enough private password","timezone":"Europe/Paris"}"#)).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/verify")
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        r#"{"email":"person@example.fr","code":"12345678"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let response=app.clone().oneshot(Request::builder().method("POST").uri("/api/v1/auth/login").header("Content-Type","application/json").body(Body::from(r#"{"email":"person@example.fr","password":"long enough private password"}"#)).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let pair: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let token = pair["access_token"].as_str().unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/session")
                    .header("Authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let session: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(session["mode"], "mobile_session");
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/refresh")
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"refresh_token":pair["refresh_token"]}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let rotated: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/logout")
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"refresh_token":pair["refresh_token"]}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/session")
                    .header(
                        "Authorization",
                        format!("Bearer {}", rotated["access_token"].as_str().unwrap()),
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
