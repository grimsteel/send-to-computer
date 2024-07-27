use std::{borrow::Cow, env::{self, args}, path::PathBuf, sync::Arc};

use axum::{extract::{State, WebSocketUpgrade}, http::{header::ORIGIN, HeaderMap, StatusCode}, response::IntoResponse, routing::get, Router};
use env_logger::Env;
use listener::serve;
use log::{error, info};
use tower_http::services::ServeDir;
use websocket::{WsHandler, WsState};

mod listener;
mod store;
mod websocket;

#[derive(Clone)]
struct FullState {
    ws_state: Arc<WsState>,
    allowed_origins: &'static [Cow<'static, str>]
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let store_path = env::var("STC_STORE_PATH").ok().map(PathBuf::from);
    let allowed_origins = env::var("STC_ALLOWED_ORIGINS").ok()
        .map(|v| v.split(',').map(|a| Cow::Owned(a.to_owned())).collect())
        .unwrap_or_else(|| vec!["http://localhost:8080".into(), "http://127.0.0.1:8080".into()]);

    // leak the allowed origins - they live for static
    let allowed_origins = Box::leak(allowed_origins.into_boxed_slice()) as &'static [Cow<str>];

    if let Some(store_path) = &store_path {
        info!("Using persistent store at {}", store_path.display());
    } else {
        info!("Using in-memory store");
    }

    match WsState::new(store_path).map(Arc::new) {
        Ok(ws_state) => {
            // serve
            match args().try_into() {
                Ok(addr) => {
                    let state = FullState {
                        ws_state,
                        allowed_origins
                    };
                    
                    let app = Router::new()
                        .route("/socket", get(socket))
                        .with_state(state)
                        .nest_service("/", ServeDir::new("static"));
                    
                    if let Err(err) = serve(app, addr).await {
                        error!("An error occurred while serving the application: {err}");
                    }
                }
                Err(err) => {
                    error!("Invalid bind address: {err}");
                }
            }
        },
        Err(err) => {
            error!("Error while in store init: {err}");
        }
    }
}

async fn socket(ws: WebSocketUpgrade, headers: HeaderMap, State(state): State<FullState>) -> impl IntoResponse {
    // websockets are not subject to CORS
    let origin = headers.get(ORIGIN);
    if origin
        .and_then(|o| o.to_str().ok())
        .is_some_and(|a| state.allowed_origins.iter().any(|o| o == a)) {
        // actually handle this websocket
        ws.on_upgrade(move |socket| async {
            let mut handler = WsHandler::new(socket, state.ws_state);
            handler.handle().await;
        }).into_response()
    } else {
        // not an allowed origin
        StatusCode::FORBIDDEN.into_response()
    }
}
