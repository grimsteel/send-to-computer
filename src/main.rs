use std::env::args;

use axum::Router;
use listener::serve;
use log::error;
use tower_http::services::ServeDir;

mod listener;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .nest_service("/", ServeDir::new("static"));

    match args().try_into() {
        Ok(addr) => {
            if let Err(err) = serve(app, addr).await {
                error!("An error occurred while serving the application: {err}");
            }
        },
        Err(err) => {
            error!("Invalid bind address: {err}");
        }
    }
}
