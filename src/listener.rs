use std::{env::Args, io, net::{AddrParseError, IpAddr, Ipv4Addr}, num::ParseIntError};

use axum::Router;
use hyper::service::service_fn;
use hyper_util::{rt::{TokioExecutor, TokioIo}, server::conn::auto::Builder as ServerBuilder};
use tokio::{fs::remove_file, net::{TcpListener, UnixListener}};
use log::error;
use tokio_util::net::Listener;
use tower::Service;

const LOCALHOST_V4: IpAddr = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

/// A TCP address or Unix Socket address
pub enum ListenerBindAddr {
    TcpSocket(IpAddr, u16),
    UnixSocket(String)
}

impl TryFrom<Args> for ListenerBindAddr {
    type Error = String;

    fn try_from(mut value: Args) -> Result<Self, Self::Error> {
        match value.len() {
            0 => {
                // no arguments provided - localhost on a random port
                Ok(ListenerBindAddr::TcpSocket(LOCALHOST_V4, 0))
            },
            1 => {
                // unix socket or ip addr or port
                let arg = value.next().unwrap();
                
                if let Some(uds_path) = arg.strip_prefix("uds:") {
                    // if it starts with uds:, it's a unix socket
                    Ok(ListenerBindAddr::UnixSocket(uds_path.into()))
                } else if let Ok(port) = arg.parse() {
                    // if it's a valid u16, it's just a port on localhost
                    Ok(ListenerBindAddr::TcpSocket(LOCALHOST_V4, port))
                } else if let Ok(ip_addr) = arg.parse() {
                    // if it's a valid ip addr, it's a random port on the address
                    Ok(ListenerBindAddr::TcpSocket(ip_addr, 0))
                } else {
                    Err(format!("Invalid argument: {arg}. Must be a valid UDS path, port, or ip address"))
                }
            },
            2 => {
                // ip addr + port
                let ip_addr = value.next().unwrap();
                let port = value.next().unwrap();

                // parse the address and port
                let ip_addr = ip_addr.parse().map_err(|e: AddrParseError| e.to_string())?;
                let port = port.parse().map_err(|e: ParseIntError| e.to_string())?;

                Ok(ListenerBindAddr::TcpSocket(ip_addr, port))
            },
            _ => {
                Err("Too many arguments provided".into())
            }
        }
    }
}

async fn serve_router<T: Listener>(app: Router, listener: T) -> io::Result<()> {
    loop {
        let (socket, _addr) = listener.accept().await?;
        let service = app.clone();
        // new task for each connection
        tokio::spawn(async move {
            // setup the hyper socket and service
            let socket = TokioIo::new(socket);
            let hyper_service = service_fn(move |req| service.clone().call(req));
            // serve the connection
            if let Err(err) = ServerBuilder::new(TokioExecutor::new())
                .serve_connection_with_upgrades(socket, hyper_service)
                .await
            {
                error!("Failed to serve connection: {err}");
            }
        });
    }
}

/// serve an axum `Router` on the specific `ListenerBindAddr`
pub async fn serve(app: Router, addr: ListenerBindAddr) -> io::Result<()> {
    match addr {
        ListenerBindAddr::TcpSocket(ip_addr, port) => {
            let listener = TcpListener::bind((ip_addr, port)).await.unwrap();
            serve_router(app, listener).await
        },
        ListenerBindAddr::UnixSocket(path) => {
            remove_file(&path).await?;
            let listener = UnixListener::bind(path).unwrap();
            serve_router(app, listener).await
        }
    }
}
