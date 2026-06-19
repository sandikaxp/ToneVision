use axum::{
    extract::{Path, Query, State, ws::{WebSocketUpgrade, WebSocket, Message}},
    response::{IntoResponse, Response},
    routing::{get, post, delete},
    Json, Router,
};
use axum::http::StatusCode;
use tower_http::cors::CorsLayer;
use rust_embed::RustEmbed;
use std::net::SocketAddr;

use crate::state::{AppState, RoomState, RoomMessage, ClientConnection};

#[derive(RustEmbed)]
#[folder = "public/"]
struct Assets;

#[derive(serde::Deserialize)]
pub struct TxQuery {
    pin: String,
}

#[derive(serde::Deserialize)]
pub struct QrQuery {
    url: String,
}

#[derive(serde::Deserialize)]
pub struct CreateRoomAdminPayload {
    room_id: String,
    pin: String,
    password: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct DeleteRoomAdminQuery {
    password: Option<String>,
}

#[derive(serde::Serialize)]
pub struct RoomInfo {
    room_id: String,
    tx_connected: bool,
    paused: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pin: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct ListRoomsQuery {
    password: Option<String>,
}

#[derive(serde::Serialize)]
pub struct NetworkInfo {
    local_ip: String,
    port: u16,
}

#[derive(serde::Deserialize)]
pub struct AdminQuery {
    password: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct AdminAuthPayload {
    password: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct AdminSettingsPayload {
    password: Option<String>,
    new_password: Option<String>,
    keep_alive_mins: u32,
    auto_open_browser: bool,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // API routes
        .route("/api/rooms", get(list_rooms).post(create_room_admin))
        .route("/api/rooms/:room_id", delete(delete_room_admin))
        .route("/api/network", get(get_network_info))
        .route("/api/qr", get(get_qr))
        // Admin Settings & Connections Monitor API
        .route("/api/admin/settings", get(get_admin_settings).post(post_admin_settings))
        .route("/api/admin/connections", get(get_admin_connections))
        .route("/api/admin/reset", post(post_admin_reset))
        // WebSocket routes
        .route("/ws/tx/:room_id", get(handle_tx_ws))
        .route("/ws/rx/:room_id", get(handle_rx_ws))
        // Serve embedded static files from memory
        .fallback(static_handler)
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// REST API: List active rooms
async fn list_rooms(
    State(state): State<AppState>,
    query: Option<Query<ListRoomsQuery>>,
) -> impl IntoResponse {
    let Query(q) = query.unwrap_or(Query(ListRoomsQuery { password: None }));
    let is_admin = is_admin_authorized(&state, q.password).await;
    let lock = state.0.lock().await;
    let rooms_list: Vec<RoomInfo> = lock.rooms.iter()
        .filter(|(_, room)| !room.pin.is_empty()) // Filter out RX placeholders
        .map(|(room_id, room)| RoomInfo {
            room_id: room_id.clone(),
            tx_connected: room.tx_connected,
            paused: room.paused,
            pin: if is_admin { Some(room.pin.clone()) } else { None },
        })
        .collect();
    
    (StatusCode::OK, Json(rooms_list))
}

// Helper: Check admin password
async fn is_admin_authorized(state: &AppState, pass: Option<String>) -> bool {
    let lock = state.0.lock().await;
    let expected = lock.config.admin_password.clone();
    drop(lock);
    pass.map(|p| p == expected).unwrap_or(false)
}

// REST API: Pre-create room (Admin only)
async fn create_room_admin(
    State(state): State<AppState>,
    Json(payload): Json<CreateRoomAdminPayload>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, payload.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let room_id = payload.room_id.trim().to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");
    if room_id.is_empty() {
        return (StatusCode::BAD_REQUEST, "Invalid Room ID").into_response();
    }

    let mut lock = state.0.lock().await;
    if lock.rooms.contains_key(&room_id) {
        if let Some(room) = lock.rooms.get_mut(&room_id) {
            room.pin = payload.pin.clone();
        }
    } else {
        let (broadcast_tx, _) = tokio::sync::broadcast::channel(100);
        let room = RoomState {
            pin: payload.pin.clone(),
            tx_connected: false,
            text_buffer: String::new(),
            paused: false,
            broadcast_tx,
            tx_cancel: None,
        };
        lock.rooms.insert(room_id, room);
    }
    drop(lock);

    state.save_to_disk().await;

    (StatusCode::OK, "Room created successfully").into_response()
}

// REST API: Delete / close room (Admin only)
async fn delete_room_admin(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Query(query): Query<DeleteRoomAdminQuery>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, query.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let mut lock = state.0.lock().await;
    if lock.rooms.remove(&room_id).is_some() {
        drop(lock);
        state.save_to_disk().await;
        (StatusCode::OK, "Room deleted successfully").into_response()
    } else {
        (StatusCode::NOT_FOUND, "Room not found").into_response()
    }
}

// REST API: Get network info
async fn get_network_info(State(state): State<AppState>) -> impl IntoResponse {
    let lock = state.0.lock().await;
    let info = NetworkInfo {
        local_ip: lock.local_ip.clone(),
        port: lock.port,
    };
    (StatusCode::OK, Json(info))
}

// REST API: Generate QR SVG
async fn get_qr(Query(query): Query<QrQuery>) -> impl IntoResponse {
    match crate::network::generate_qr_svg(&query.url) {
        Ok(svg) => (
            StatusCode::OK,
            [("content-type", "image/svg+xml")],
            svg,
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to generate QR code: {}", e)
        ).into_response(),
    }
}

// REST API: Get admin settings
async fn get_admin_settings(
    State(state): State<AppState>,
    Query(query): Query<AdminQuery>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, query.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let lock = state.0.lock().await;
    let config = lock.config.clone();
    drop(lock);

    (StatusCode::OK, Json(serde_json::json!({
        "keep_alive_mins": config.keep_alive_mins,
        "auto_open_browser": config.auto_open_browser
    }))).into_response()
}

// REST API: Update admin settings
async fn post_admin_settings(
    State(state): State<AppState>,
    Json(payload): Json<AdminSettingsPayload>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, payload.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let mut lock = state.0.lock().await;
    if let Some(new_pass) = payload.new_password {
        let trimmed = new_pass.trim().to_string();
        if !trimmed.is_empty() {
            lock.config.admin_password = trimmed;
        }
    }
    lock.config.keep_alive_mins = payload.keep_alive_mins;
    lock.config.auto_open_browser = payload.auto_open_browser;
    drop(lock);

    state.save_config_to_disk().await;

    (StatusCode::OK, "Settings updated successfully").into_response()
}

// REST API: Get active connections list
async fn get_admin_connections(
    State(state): State<AppState>,
    Query(query): Query<AdminQuery>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, query.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let lock = state.0.lock().await;
    let connections: Vec<crate::state::ClientConnection> = lock.active_connections.values().cloned().collect();
    drop(lock);

    (StatusCode::OK, Json(connections)).into_response()
}

// REST API: Factory Reset (clear all rooms)
async fn post_admin_reset(
    State(state): State<AppState>,
    Json(payload): Json<AdminAuthPayload>,
) -> impl IntoResponse {
    if !is_admin_authorized(&state, payload.password).await {
        return (StatusCode::UNAUTHORIZED, "Unauthorized admin access").into_response();
    }

    let mut lock = state.0.lock().await;
    lock.rooms.clear();
    lock.active_connections.clear();
    drop(lock);

    state.save_to_disk().await;

    (StatusCode::OK, "Server database reset successfully").into_response()
}

// WebSocket handler for Transmitter (TX)
async fn handle_tx_ws(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    Query(query): Query<TxQuery>,
    State(state): State<AppState>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
) -> Response {
    let client_ip = addr.to_string();
    let conn = ClientConnection {
        ip: client_ip.clone(),
        role: "Typist".to_string(),
        room_id: room_id.clone(),
        connected_at_secs: std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    let mut lock = state.0.lock().await;
    lock.active_connections.insert(client_ip.clone(), conn);

    let (tx_cancel_tx, tx_cancel_rx) = tokio::sync::oneshot::channel::<()>();

    if let Some(room) = lock.rooms.get_mut(&room_id) {
        if room.pin.is_empty() {
            room.pin = query.pin.clone();
        } else if room.pin != query.pin {
            lock.active_connections.remove(&client_ip);
            return (StatusCode::UNAUTHORIZED, "Invalid PIN for this Room").into_response();
        }

        if let Some(old_cancel) = room.tx_cancel.take() {
            let _ = old_cancel.send(());
        }
        room.tx_cancel = Some(tx_cancel_tx);
    } else {
        let (broadcast_tx, _) = tokio::sync::broadcast::channel(100);
        let room = RoomState {
            pin: query.pin.clone(),
            tx_connected: false,
            text_buffer: String::new(),
            paused: false,
            broadcast_tx,
            tx_cancel: Some(tx_cancel_tx),
        };
        lock.rooms.insert(room_id.clone(), room);
    }
    drop(lock);

    ws.on_upgrade(move |socket| tx_socket_handler(socket, room_id, state, tx_cancel_rx, client_ip))
}

async fn tx_socket_handler(
    mut socket: WebSocket,
    room_id: String,
    state: AppState,
    mut tx_cancel_rx: tokio::sync::oneshot::Receiver<()>,
    client_ip: String,
) {
    let mut lock = state.0.lock().await;
    let text_history = if let Some(room) = lock.rooms.get_mut(&room_id) {
        room.tx_connected = true;
        room.text_buffer.clone()
    } else {
        lock.active_connections.remove(&client_ip);
        return;
    };
    drop(lock);

    let history_msg = RoomMessage::Text { text: text_history };
    if let Ok(json) = serde_json::to_string(&history_msg) {
        let _ = socket.send(Message::Text(json)).await;
    }

    loop {
        tokio::select! {
            _ = &mut tx_cancel_rx => {
                let _ = socket.send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4001,
                    reason: std::borrow::Cow::Borrowed("superseded"),
                }))).await;
                break;
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<RoomMessage>(&text) {
                            Ok(RoomMessage::Ping) => {
                                // No-op, heartbeat
                            }
                            Ok(room_msg) => {
                                let mut lock = state.0.lock().await;
                                if let Some(room) = lock.rooms.get_mut(&room_id) {
                                    match &room_msg {
                                        RoomMessage::Text { text } => {
                                            room.text_buffer = text.clone();
                                        }
                                        RoomMessage::Pause { paused } => {
                                            room.paused = *paused;
                                        }
                                        RoomMessage::Clear => {
                                            room.text_buffer.clear();
                                        }
                                        RoomMessage::Ping => {}
                                    }
                                    let _ = room.broadcast_tx.send(room_msg);
                                }
                                drop(lock);
                                state.save_to_disk().await;
                            }
                            Err(e) => {
                                eprintln!("WebSocket deserialization error: {:?}. Raw text: {}", e, text);
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    let mut lock = state.0.lock().await;
    lock.active_connections.remove(&client_ip);
    if let Some(room) = lock.rooms.get_mut(&room_id) {
        let is_superseded = match tx_cancel_rx.try_recv() {
            Ok(_) => true,
            Err(tokio::sync::oneshot::error::TryRecvError::Closed) => true,
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => false,
        };
        if !is_superseded {
            room.tx_connected = false;
            room.tx_cancel = None;

            let keep_alive_mins = lock.config.keep_alive_mins;
            if keep_alive_mins > 0 {
                let state_clone = state.clone();
                let room_id_clone = room_id.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(keep_alive_mins as u64 * 60)).await;
                    let mut lock = state_clone.0.lock().await;
                    if let Some(r) = lock.rooms.get_mut(&room_id_clone) {
                        if !r.tx_connected {
                            r.text_buffer.clear();
                            let _ = r.broadcast_tx.send(RoomMessage::Clear);
                            println!("Grace period expired for room '{}'. Cleared text history.", room_id_clone);
                        }
                    }
                    drop(lock);
                    state_clone.save_to_disk().await;
                });
            }
        }
    }
    drop(lock);
}

// WebSocket handler for Receiver (RX)
async fn handle_rx_ws(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    State(state): State<AppState>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
) -> Response {
    let client_ip = addr.to_string();
    let conn = ClientConnection {
        ip: client_ip.clone(),
        role: "Reader".to_string(),
        room_id: room_id.clone(),
        connected_at_secs: std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    let mut lock = state.0.lock().await;
    lock.active_connections.insert(client_ip.clone(), conn);
    
    let rx_receiver = if let Some(room) = lock.rooms.get(&room_id) {
        room.broadcast_tx.subscribe()
    } else {
        let (broadcast_tx, _) = tokio::sync::broadcast::channel(100);
        let rx_receiver = broadcast_tx.subscribe();
        let room = RoomState {
            pin: String::new(),
            tx_connected: false,
            text_buffer: String::new(),
            paused: false,
            broadcast_tx,
            tx_cancel: None,
        };
        lock.rooms.insert(room_id.clone(), room);
        rx_receiver
    };

    let (initial_text, initial_paused) = if let Some(room) = lock.rooms.get(&room_id) {
        (room.text_buffer.clone(), room.paused)
    } else {
        (String::new(), false)
    };
    drop(lock);

    ws.on_upgrade(move |socket| rx_socket_handler(socket, rx_receiver, initial_text, initial_paused, state, client_ip))
}

async fn rx_socket_handler(
    mut socket: WebSocket,
    mut rx_receiver: tokio::sync::broadcast::Receiver<RoomMessage>,
    initial_text: String,
    initial_paused: bool,
    state: AppState,
    client_ip: String,
) {
    let init_text_msg = RoomMessage::Text { text: initial_text };
    if let Ok(json) = serde_json::to_string(&init_text_msg) {
        let _ = socket.send(Message::Text(json)).await;
    }

    let init_pause_msg = RoomMessage::Pause { paused: initial_paused };
    if let Ok(json) = serde_json::to_string(&init_pause_msg) {
        let _ = socket.send(Message::Text(json)).await;
    }

    loop {
        tokio::select! {
            val = rx_receiver.recv() => {
                match val {
                    Ok(room_msg) => {
                        if let Ok(json) = serde_json::to_string(&room_msg) {
                            if socket.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if text.contains("\"ping\"") {
                            // No-op, heartbeat
                        }
                    }
                    Some(Ok(_)) => {}
                    _ => break,
                }
            }
        }
    }

    let mut lock = state.0.lock().await;
    lock.active_connections.remove(&client_ip);
    drop(lock);
}

// Embedded static asset serving handler
async fn static_handler(uri: axum::http::Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    
    if path.is_empty() {
        path.push_str("index.html");
    } else if path == "tx" || path == "tx/" {
        path = "tx/index.html".to_string();
    } else if path == "rx" || path == "rx/" {
        path = "rx/index.html".to_string();
    } else if path == "admin" || path == "admin/" {
        path = "admin/index.html".to_string();
    } else if path.ends_with('/') {
        path.push_str("index.html");
    }

    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                StatusCode::OK,
                [("content-type", mime.as_ref())],
                content.data.into_owned(),
            ).into_response()
        }
        None => {
            if path != "index.html" {
                match Assets::get("index.html") {
                    Some(content) => {
                        (
                            StatusCode::OK,
                            [("content-type", "text/html")],
                            content.data.into_owned(),
                        ).into_response()
                    }
                    None => (StatusCode::NOT_FOUND, "Not Found").into_response()
                }
            } else {
                (StatusCode::NOT_FOUND, "Not Found").into_response()
            }
        }
    }
}
