# ToneVision: Assistive Text Streaming Application
## Requirements & System Specification

ToneVision is a lightweight, ultra-low-latency assistive text streaming application operating on a Local Web-Server Architecture. It allows typists to stream their text in real-time to readers over a Local Area Network (LAN).

---

## 1. Core Objectives & Key Features

- **Near-Zero Latency:** Extremely fast keystroke and text transmission over local LAN WebSockets.
- **Independent Visual Accessibility (Decoupling):** Reader settings (font size, font family, color scheme) are completely independent of the typist's settings and are persisted locally on the reader's browser.
- **Multiple Active Rooms (Multi-Session):** The server supports multiple independent typing sessions running concurrently. Each typist has a distinct "Room" routed to their specific readers.
- **Active Rooms List on Landing:** When navigating to the root URL `/`, users see a dynamic list of currently active rooms. 
  - Readers (RX) can join any active room instantly with a single click.
  - Typists (TX) can click to resume an active session (by entering the correct PIN) or create a new room.
- **Admin Room Management Page:** A dedicated, password-protected admin page (`/admin`) allows pre-creating rooms, assigning Room IDs and 4-digit PINs, and deleting/closing rooms. The default admin password is **`admin`**.
- **Data Persistence (Restart Protection):** To survive computer reboots or server restarts, all room structures (Room IDs, PINs, and active text buffers) are automatically saved to a local JSON file (`rooms.json`) on the server.
- **Self-Contained Executable (Asset Embedding):** All HTML, CSS, and JS web assets are compiled directly into the binary at build time. No external `public/` directory is needed for deployment.
- **Cognitive Focus Mode:** Immersive readability aids on the reader's interface that highlight the active sentence and fade historical text.
- **Zero-Install BYOD (Bring Your Own Device):** Both typists and readers connect entirely via standard web browsers. No native apps are required.

---

## 2. System Architecture

The application is structured as a standalone Rust backend that serves static HTML/CSS/JS frontend files (embedded in-memory), provides an HTTP REST API to query and manage session statuses, and routes WebSocket connections.

```
       [ Transmitter (TX Web Client) ] 
                     │
                     │ Keystrokes & Control events
                     ▼ (via WS to /ws/tx/:room_id)
        ┌───────────────────────────────┐
        │       Rust Backend Hub        │
        │ - Axum Static File Server     │
        │ - REST API (/api/rooms)       │      ┌──────────────┐
        │ - Admin API / Admin Panel     │◄────►│  rooms.json  │
        │ - WebSocket Room Registry     │      │ (Persistence)│
        └───────────────────────────────┘      └──────────────┘
                     │
                     │ Broadcast events
                     ▼ (via WS to /ws/rx/:room_id)
       [ Receiver (RX Web Client 1..N) ]
```

### 2.1 Backend Server (Rust)
- **Language & Crates:** Built using Rust with `tokio` (async runtime), `axum` (HTTP & WebSockets), `rust-embed` (for in-memory asset compilation), and `fast_qr` (QR code generation).
- **Room Registry:** Dynamically manages a list of active `room_id` channels using thread-safe structures (e.g. `Mutex<HashMap<String, RoomState>>`).
- **REST API:**
  - `GET /api/rooms`: Returns JSON list of active rooms.
  - `POST /api/rooms`: (Admin-only) Pre-creates a room with a Room ID and 4-digit PIN.
  - `DELETE /api/rooms/:room_id`: (Admin-only) Deletes and closes an active room.
- **LAN Discovery:** Automatically detects the server's LAN IP address on startup and displays access links/QR code info on the console and TX interface.
- **Auto-Open Browser:** Automatically opens the default system web browser to the local landing page (`http://localhost:<port>`) on startup.

### 2.2 Admin Dashboard (Admin Panel)
- **Path:** `http://<LAN_IP>:8080/admin/index.html`
- **Security:** Requires the password **`admin`** to authorize management actions.
- **Controls:** Allows viewing a list of all active rooms, adding new rooms with predefined 4-digit PINs, and deleting active rooms.

### 2.3 Data Persistence
- **Storage:** A local `rooms.json` file is maintained in the executable's directory.
- **Write Trigger:** The server serializes and writes its entire room state to disk whenever a room is created, text is modified, or a room is deleted.
- **Startup Sync:** Upon server initialization, the server checks for the existence of `rooms.json` and automatically populates the memory registry with the saved room configurations and history buffers.

### 2.4 Transmitter Frontend (TX - The Typist)
- **Path:** `http://<LAN_IP>:8080/tx?room=<room_id>`
- **Room Creation & PIN Security:** When initiating a session, the typist sets a **4-digit PIN** for the room. The PIN is sent during the WebSocket connection to authenticate the typist. 
- **Keystroke Ingestion:** Captures typist inputs and pushes text updates over a WebSocket connection to `/ws/tx/:room_id`.
- **Session Controls:** 
  - **Pause:** Freezes rendering on connected RX clients without disconnecting them.
  - **Clear:** Instantly wipes the stream buffer and text areas on both the TX and all connected RX clients.
- **Pairing QR Code:** Displays a pairing QR code embedding `http://<LAN_IP>:8080/rx?room=<room_id>` so readers on the same LAN can scan and connect instantly.

### 2.5 Receiver Frontend (RX - The Reader)
- **Path:** `http://<LAN_IP>:8080/rx?room=<room_id>`
- **Room Subscription:** Reads `room_id` from the URL search parameters and subscribes via WebSocket to `/ws/rx/:room_id`. (Receivers do not need the PIN, it is only for Transmitter authentication).
- **Text Rendering:** Renders incoming text instantly.
- **Visual Decoupling:** Reader settings are fully independent of the typist's view. Changing settings in one RX browser window does not affect other RX or TX windows.
- **Persistent Settings:** Uses `localStorage` to save settings across browser refreshes:
  - **Font Size / Scale:** Adjustable text size for legibility.
  - **Font Family:** Toggle between clean sans-serif (e.g., Inter, Outfit), monospace, and dyslexic-friendly fonts.
  - **Color Themes:** Sleek dark modes, high-contrast themes, and soft reading backgrounds (e.g., sepia, soft teal/navy glassmorphism).

---

## 3. Session Recovery & Reconnection

- **Authentication & Anti-Hijacking:** The 4-digit PIN ensures that only the original typist can broadcast to their specific `room_id`. If someone else tries to connect as a Transmitter to an existing room without the correct PIN, the server rejects them.
- **Client Persistence:** The Transmitter saves the `room_id`, the 4-digit PIN, and its active text buffer to `localStorage`. If the browser accidentally reloads, it auto-reconnects and authenticates seamlessly.
- **Server History Grace Period:** When a Transmitter disconnects, the backend keeps the room active and holds the text history. Upon a successful PIN-authenticated reconnection, the server sends the recent text history back to the Transmitter so their editor is instantly in sync with the Receivers.

---

## 4. Cognitive Reading Features

### 4.1 Cognitive Focus Mode
- **Punctuation Parsing:** The RX client parses text stream updates, identifying sentence boundaries delimited by `.`, `!`, and `?`.
- **Active Sentence Highlighting:** The active sentence (the one currently being typed) is highlighted with normal opacity and a distinct visual styling.
- **History Fading:** As new sentences are completed, older sentences fade to a lower opacity/gray state to help the reader maintain focus on the active sentence without losing context.

### 4.2 Bionic Reading Option (Optional Aesthetic Enhancement)
- Bold representation of the starting letters of each word to help the eye scan text faster.

---

## 5. UI/UX & Design Guidelines

- **Premium Look and Feel:** Interfaces must use modern typography (e.g., Google Fonts Inter/Outfit), smooth gradients, sleek borders, and micro-interactions.
- **Glassmorphism:** Use translucent card layouts (`backdrop-filter: blur()`) with soft drop shadows over dynamic background gradients.
- **No Simple Placeholders:** Every aspect of the UI must feel like a production-ready application.
