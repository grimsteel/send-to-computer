use std::{env::args, sync::Arc};

use axum::{extract::{State, WebSocketUpgrade}, http::{header::ORIGIN, HeaderMap, StatusCode}, response::IntoResponse, routing::get, Router};
use env_logger::Env;
use listener::serve;
use log::error;
use tower_http::services::ServeDir;
use websocket::{ws_handler, WsState};

mod listener;
mod store;
mod websocket;

// TODO: don't hardcode
const ALLOWED_ORIGINS: [&'static str; 2] = ["http://localhost:8080", "http://127.0.0.1:8080"];

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    // store in memory for now
    // TODO: command line args
    match WsState::new::<String>(None).map(Arc::new) {
        Ok(ws_state) => {
            let app = Router::new()
                .route("/socket", get(socket))
                .with_state(ws_state)
                .nest_service("/", ServeDir::new("static"));

            // serve
            match args().try_into() {
                Ok(addr) => {
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

async fn socket(ws: WebSocketUpgrade, headers: HeaderMap, State(state): State<Arc<WsState>>) -> impl IntoResponse {
    // websockets are not subject to CORS
    let origin = headers.get(ORIGIN);
    if origin.and_then(|o| o.to_str().ok()).is_some_and(|a| ALLOWED_ORIGINS.contains(&a)) {
        // actually handle this websocket
        ws.on_upgrade(move |socket| ws_handler(socket, state)).into_response()
    } else {
        // not an allowed origin
        StatusCode::FORBIDDEN.into_response()
    }
}
