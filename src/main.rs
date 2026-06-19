#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod state;
mod network;
mod server;
mod tray;

use state::AppState;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let local_ip = network::get_local_ip();
    let mut port = 8080;

    // Port-binding loop with auto-increment fallback
    let (listener, bound_port) = loop {
        let addr_str = format!("0.0.0.0:{}", port);
        match tokio::net::TcpListener::bind(&addr_str).await {
            Ok(listener) => {
                break (listener, port);
            }
            Err(e) => {
                eprintln!("Port {} is already in use ({}). Trying next port...", port, e);
                port += 1;
                if port > 8100 {
                    panic!("Could not bind to any port in range 8080-8100.");
                }
            }
        }
    };

    println!("==================================================");
    println!(" ToneVision Local Server Starting...");
    println!("--------------------------------------------------");
    println!(" Local Loopback URL: http://localhost:{}", bound_port);
    println!(" LAN Broadcast URL:  http://{}:{}", local_ip, bound_port);
    println!("==================================================");

    // Initialize state and load persisted database
    let state = AppState::new(local_ip, bound_port);
    state.load_from_disk().await;

    // Initialize system tray icon (Windows only)
    tray::init_tray(bound_port);

    // Setup routes
    let app = server::create_router(state.clone());

    // Open landing page automatically in the default web browser after a tiny delay if enabled
    let loopback_url = format!("http://localhost:{}", bound_port);
    let state_clone = state.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
        let lock = state_clone.0.lock().await;
        let should_open = lock.config.auto_open_browser;
        drop(lock);

        if should_open {
            if let Err(e) = open::that(&loopback_url) {
                eprintln!("Failed to open browser automatically: {:?}", e);
            } else {
                println!("Automatically opened landing page: {}", loopback_url);
            }
        }
    });

    // Serve application
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
