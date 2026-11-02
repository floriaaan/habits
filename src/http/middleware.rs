use crate::modules::DomainError;
use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone)]
pub struct TrafficBudget(Arc<Mutex<(Instant, u32)>>);
impl Default for TrafficBudget {
    fn default() -> Self {
        Self(Arc::new(Mutex::new((Instant::now(), 0))))
    }
}

impl TrafficBudget {
    fn admit(&self) -> Result<(), ApiError> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
        if state.0.elapsed() >= Duration::from_secs(1) {
            *state = (Instant::now(), 0);
        }
        if state.1 >= 120 {
            return Err(ApiError::status(StatusCode::TOO_MANY_REQUESTS));
        }
        state.1 += 1;
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    pub request_id: String,
}
#[derive(Serialize, ToSchema)]
pub struct ErrorEnvelope {
    pub error: ErrorDetail,
}

pub struct ApiError {
    status: StatusCode,
    detail: ErrorDetail,
}
impl ApiError {
    pub fn validation(message: &'static str) -> Self {
        Self::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "validation_error",
            message,
        )
    }
    fn new(status: StatusCode, code: &str, message: &str) -> Self {
        Self {
            status,
            detail: ErrorDetail {
                code: code.into(),
                message: message.into(),
                request_id: String::new(),
            },
        }
    }
    pub fn status(status: StatusCode) -> Self {
        let (code, message) = match status {
            StatusCode::UNAUTHORIZED => ("unauthorized", "Valid authentication required"),
            StatusCode::FORBIDDEN => ("forbidden", "Insufficient scope"),
            StatusCode::NOT_FOUND => ("not_found", "Resource not found"),
            StatusCode::METHOD_NOT_ALLOWED => ("method_not_allowed", "Method not allowed"),
            StatusCode::PAYLOAD_TOO_LARGE => {
                ("payload_too_large", "Request body exceeds 16384 bytes")
            }
            StatusCode::TOO_MANY_REQUESTS => ("rate_limited", "Request rate exceeded"),
            StatusCode::GATEWAY_TIMEOUT => ("timeout", "Request deadline exceeded"),
            StatusCode::SERVICE_UNAVAILABLE => ("unavailable", "Service unavailable"),
            _ => ("request_error", "Request could not be processed"),
        };
        Self::new(status, code, message)
    }
}
impl From<DomainError> for ApiError {
    fn from(value: DomainError) -> Self {
        match value {
            DomainError::Unauthenticated => Self::status(StatusCode::UNAUTHORIZED),
            DomainError::Validation(message) => Self::validation(message),
            DomainError::NotFound => Self::status(StatusCode::NOT_FOUND),
            DomainError::Forbidden => Self::status(StatusCode::FORBIDDEN),
            DomainError::Conflict => Self::new(
                StatusCode::CONFLICT,
                "idempotency_conflict",
                "Idempotency key already used with a different payload",
            ),
            DomainError::Unavailable => Self::status(StatusCode::SERVICE_UNAVAILABLE),
        }
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = self.status.into_response();
        response.extensions_mut().insert(self.detail);
        if self.status == StatusCode::UNAUTHORIZED {
            response
                .headers_mut()
                .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
        }
        if self.status == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static("1"));
        }
        response
    }
}

/// Production gate: deliberately ignores Authorization and untrusted identity headers.
pub async fn deny_private(_request: Request, _next: Next) -> Response {
    ApiError::status(StatusCode::UNAUTHORIZED).into_response()
}

pub async fn authenticate(
    State((store, mode, oidc)): State<(
        crate::infrastructure::database::Store,
        crate::config::AuthMode,
        Option<std::sync::Arc<crate::infrastructure::security::oidc::OidcVerifier>>,
    )>,
    mut request: Request,
    next: Next,
) -> Response {
    if mode == crate::config::AuthMode::Disabled {
        return ApiError::status(StatusCode::UNAUTHORIZED).into_response();
    }
    let credentials = request.headers().get_all(header::AUTHORIZATION);
    if credentials.iter().count() != 1 {
        return ApiError::status(StatusCode::UNAUTHORIZED).into_response();
    }
    let token = credentials
        .iter()
        .next()
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split_once(' '))
        .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("bearer"))
        .map(|(_, token)| token);
    let Some(token) = token else {
        return ApiError::status(StatusCode::UNAUTHORIZED).into_response();
    };
    let identity = match mode {
        crate::config::AuthMode::Disabled => Err(DomainError::Unauthenticated),
        crate::config::AuthMode::Tokens => store.authenticate_local_token(token).await,
        crate::config::AuthMode::Oidc => {
            if token.starts_with("ht_") {
                store.authenticate_token(token).await
            } else if let Some(verifier) = oidc {
                match verifier.verify(token).await {
                    Ok(identity) => {
                        store
                            .oidc_principal(&identity.issuer, &identity.subject, identity.scopes)
                            .await
                    }
                    Err(error) => Err(error),
                }
            } else {
                Err(DomainError::Unauthenticated)
            }
        }
    };
    match identity {
        Ok(actor) => {
            request.extensions_mut().insert(actor);
            next.run(request).await
        }
        Err(error) => ApiError::from(error).into_response(),
    }
}

pub async fn boundary(
    State(budget): State<TrafficBudget>,
    request: Request,
    next: Next,
) -> Response {
    let id = Uuid::new_v4().to_string();
    let method = request.method().to_string();
    let started = Instant::now();
    let mut response = match budget.admit() {
        Err(error) => error.into_response(),
        Ok(()) => match tokio::time::timeout(Duration::from_secs(10), next.run(request)).await {
            Ok(response) => response,
            Err(_) => ApiError::status(StatusCode::GATEWAY_TIMEOUT).into_response(),
        },
    };
    let status = response.status();
    if status.is_client_error() || status.is_server_error() {
        let mut detail = response
            .extensions()
            .get::<ErrorDetail>()
            .cloned()
            .unwrap_or_else(|| ApiError::status(status).detail);
        detail.request_id.clone_from(&id);
        let body = Json(ErrorEnvelope { error: detail })
            .into_response()
            .into_body();
        *response.body_mut() = body;
        response.headers_mut().remove(header::CONTENT_LENGTH);
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
    }
    if let Ok(value) = HeaderValue::from_str(&id) {
        response.headers_mut().insert("x-request-id", value);
    }
    response.headers_mut().insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    tracing::info!(request_id = %id, %method, status = status.as_u16(), elapsed_ms = started.elapsed().as_millis(), "request completed");
    response
}
