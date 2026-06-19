use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use serde::{Serialize, Deserialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum RoomMessage {
    Text { text: String },
    Pause { paused: bool },
    Clear,
    Ping,
}

pub struct RoomState {
    pub pin: String,
    pub tx_connected: bool,
    pub text_buffer: String,
    pub paused: bool,
    pub broadcast_tx: broadcast::Sender<RoomMessage>,
    pub tx_cancel: Option<tokio::sync::oneshot::Sender<()>>,
}

// Serializable representation of a Room for persistence
#[derive(Serialize, Deserialize)]
pub struct SavedRoom {
    pub room_id: String,
    pub pin: String,
    pub text_buffer: String,
    pub paused: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub admin_password: String,
    pub keep_alive_mins: u32,
    pub auto_open_browser: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            admin_password: "admin".to_string(),
            keep_alive_mins: 10,
            auto_open_browser: true,
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ClientConnection {
    pub ip: String,
    pub role: String, // "Typist" or "Reader"
    pub room_id: String,
    pub connected_at_secs: u64,
}

pub struct AppStateInner {
    pub rooms: HashMap<String, RoomState>,
    pub local_ip: String,
    pub port: u16,
    pub config: AppConfig,
    pub active_connections: HashMap<String, ClientConnection>,
}

#[derive(Clone)]
pub struct AppState(pub Arc<Mutex<AppStateInner>>);

impl AppState {
    pub fn new(local_ip: String, port: u16) -> Self {
        let config = Self::load_config_from_disk();
        AppState(Arc::new(Mutex::new(AppStateInner {
            rooms: HashMap::new(),
            local_ip,
            port,
            config,
            active_connections: HashMap::new(),
        })))
    }

    fn load_config_from_disk() -> AppConfig {
        let path = Path::new("config.json");
        if !path.exists() {
            let default_config = AppConfig::default();
            if let Ok(json) = serde_json::to_string_pretty(&default_config) {
                let _ = std::fs::write(path, json);
            }
            return default_config;
        }

        match std::fs::read_to_string(path) {
            Ok(content) => {
                serde_json::from_str::<AppConfig>(&content).unwrap_or_else(|_| AppConfig::default())
            }
            Err(_) => AppConfig::default(),
        }
    }

    pub async fn save_config_to_disk(&self) {
        let lock = self.0.lock().await;
        let config = lock.config.clone();
        drop(lock);

        if let Ok(json) = serde_json::to_string_pretty(&config) {
            if let Err(e) = std::fs::write("config.json", json) {
                eprintln!("Failed to write config.json: {:?}", e);
            } else {
                println!("Successfully persisted config state to config.json");
            }
        }
    }

    // Save current rooms registry to rooms.json
    pub async fn save_to_disk(&self) {
        let lock = self.0.lock().await;
        let saved_rooms: Vec<SavedRoom> = lock.rooms.iter()
            .map(|(room_id, room)| SavedRoom {
                room_id: room_id.clone(),
                pin: room.pin.clone(),
                text_buffer: room.text_buffer.clone(),
                paused: room.paused,
            })
            .collect();
        drop(lock);

        match serde_json::to_string_pretty(&saved_rooms) {
            Ok(json) => {
                if let Err(e) = std::fs::write("rooms.json", json) {
                    eprintln!("Failed to write rooms.json: {:?}", e);
                } else {
                    println!("Successfully persisted rooms state to rooms.json");
                }
            }
            Err(e) => {
                eprintln!("Failed to serialize rooms state: {:?}", e);
            }
        }
    }

    // Load rooms registry from rooms.json
    pub async fn load_from_disk(&self) {
        let path = Path::new("rooms.json");
        if !path.exists() {
            println!("No existing rooms.json found. Starting with empty room registry.");
            return;
        }

        match std::fs::read_to_string(path) {
            Ok(content) => {
                match serde_json::from_str::<Vec<SavedRoom>>(&content) {
                    Ok(saved_rooms) => {
                        let mut lock = self.0.lock().await;
                        for saved in saved_rooms {
                            let (broadcast_tx, _) = broadcast::channel(100);
                            let room_state = RoomState {
                                pin: saved.pin,
                                tx_connected: false, // Disconnected initially on restart
                                text_buffer: saved.text_buffer,
                                paused: saved.paused,
                                broadcast_tx,
                                tx_cancel: None,
                            };
                            lock.rooms.insert(saved.room_id, room_state);
                        }
                        println!("Successfully loaded {} rooms from rooms.json", lock.rooms.len());
                    }
                    Err(e) => {
                        eprintln!("Failed to parse rooms.json: {:?}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to read rooms.json: {:?}", e);
            }
        }
    }
}
