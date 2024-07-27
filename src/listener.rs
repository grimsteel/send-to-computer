use std::{
    env::Args,
    io,
    net::{AddrParseError, IpAddr, Ipv4Addr},
    num::ParseIntError,
};

use axum::Router;
use hyper::service::service_fn;
use hyper_util::{
    rt::{TokioExecutor, TokioIo},
    server::conn::auto::Builder as ServerBuilder,
};
use log::{error, info};
use tokio::{
    fs::remove_file,
    net::{TcpListener, UnixListener}, select, signal::unix::{signal, SignalKind},
};
use tokio_util::net::Listener;
use tower::Service;

const LOCALHOST_V4: IpAddr = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

/// A TCP address or Unix Socket address
pub enum ListenerBindAddr {
    TcpSocket(IpAddr, u16),
    UnixSocket(String),
}

impl TryFrom<Args> for ListenerBindAddr {
    type Error = String;

    fn try_from(all_args: Args) -> Result<Self, Self::Error> {
        // skip the executable name
        let mut args = all_args.skip(1);
        match args.len() {
            0 => {
                // no arguments provided - localhost on a random port
                Ok(ListenerBindAddr::TcpSocket(LOCALHOST_V4, 0))
            }
            1 => {
                // unix socket or ip addr or port
                let arg = args.next().unwrap();

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
                    Err(format!(
                        "Invalid argument: {arg}. Must be a valid UDS path, port, or ip address"
                    ))
                }
            }
            2 => {
                // ip addr + port
                let ip_addr = args.next().unwrap();
                let port = args.next().unwrap();

                // parse the address and port
                let ip_addr = ip_addr.parse().map_err(|e: AddrParseError| e.to_string())?;
                let port = port.parse().map_err(|e: ParseIntError| e.to_string())?;

                Ok(ListenerBindAddr::TcpSocket(ip_addr, port))
            }
            _ => Err("Too many arguments provided".into()),
        }
    }
}

/// basically a wrapper trait around `Display` to get around orphan rules
trait SocketDisplay {
    fn socket_display(&self) -> String;
}

impl SocketDisplay for tokio::net::unix::SocketAddr {
    fn socket_display(&self) -> String {
        if let Some(path) = self.as_pathname() {
            format!("{}", path.display())
        } else {
            "Unbound".into()
        }
    }
}

impl SocketDisplay for core::net::SocketAddr {
    fn socket_display(&self) -> String {
        format!("{}", self)
    }
}

async fn serve_router<T>(app: Router, mut listener: T) -> io::Result<()>
where
    T: Listener,
    <T as Listener>::Io: Unpin + Send + 'static,
    <T as Listener>::Addr: SocketDisplay,
{
    // print the address
    info!(
        "Listening on {}",
        listener
            .local_addr()
            .expect("can get address")
            .socket_display()
    );

    let mut term_signal = signal(SignalKind::terminate())?;

    loop {
        select! {
            conn = listener.accept() => {
                let (socket, _addr) = conn?;
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
            },
            _ = term_signal.recv() => {
                break Ok(());
            }
        }
    }
}

/// serve an axum `Router` on the specific `ListenerBindAddr`
pub async fn serve(app: Router, addr: ListenerBindAddr) -> io::Result<()> {
    match addr {
        ListenerBindAddr::TcpSocket(ip_addr, port) => {
            let listener = TcpListener::bind((ip_addr, port)).await?;
            serve_router(app, listener).await
        }
        ListenerBindAddr::UnixSocket(path) => {
            // remove the unix socket
            let _ = remove_file(&path).await;
            let listener = UnixListener::bind(path)?;
            serve_router(app, listener).await
        }
    }
}
