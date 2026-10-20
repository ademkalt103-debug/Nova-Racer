#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse::<u16>()?;
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let web =
        std::path::PathBuf::from(std::env::var("NOVA_WEB_DIR").unwrap_or_else(|_| "web".into()));
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    println!("NOVA RACER Rust: http://{host}:{port}");
    axum::serve(
        listener,
        nova_server::router(nova_server::App::new(web))
            .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
