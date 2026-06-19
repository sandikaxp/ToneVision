# ToneVision

**ToneVision** is a lightweight, ultra-low-latency assistive text streaming application operating on a Local Web-Server Architecture. It allows typists to stream their text in real-time to readers over a Local Area Network (LAN). The server is built in **Rust** for performance and includes a system tray icon for Windows, while serving fully responsive, premium-designed web clients from memory.

## 📦 Standalone Downloads
Pre-compiled standalone packages for Windows, macOS, and Linux are available on the [GitHub Releases](https://github.com/sandikaxp/ToneVision/releases) page. Download the zip/tar.gz archive for your platform, extract it, and run the executable directly.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [Configuration](#configuration)
- [Networking](#networking)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Near-Zero Latency Streaming** – Extremely fast keystroke and text transmission over local LAN WebSockets.
- **Independent Visual Accessibility (Decoupling)** – Reader settings (font size, font family, color scheme) are completely independent of the typist's view and are persisted locally on each reader's device (`localStorage`).
- **Cognitive Reading Aids** – Built-in options on the reader's view:
  - **Cognitive Focus Mode** – Highlights the sentence currently being typed and fades completed/historical text.
  - **Bionic Reading** – Bolds the starting letters of words to facilitate faster visual scanning.
- **Multiple Active Rooms (Multi-Session)** – Supports multiple independent typing sessions running concurrently.
- **Active Rooms Directory** – A dynamic directory on the landing page (`/`) shows all active rooms. Readers can join any active room with a single click, and typists can authenticate with a PIN to resume typing.
- **Admin Management Page** – A dedicated, password-protected admin panel (`/admin`) allows pre-creating rooms, assigning 4-digit PINs, deleting rooms, and monitoring active connections.
- **Data Persistence** – Room settings, current text buffers, and server config are automatically persisted to local JSON files (`rooms.json`, `config.json`) to survive server restarts.
- **Self-Contained Executable** – All web assets (HTML, CSS, JS) are compiled directly into the binary at build time. No external web directories are required for deployment.
- **System Tray Integration (Windows)** – Runs in the background with a system tray menu to quickly open the landing page, open the admin panel, or quit the server.

---

## Prerequisites

1. **Rust & Cargo** – Required to compile the backend.
   ```powershell
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Visual C++ Build Tools 2022** – Needed for native crate compilation on Windows.
3. **Git** – To clone the repository.

---

## Installation

```powershell
# Clone the repository
git clone https://github.com/sandikaxp/ToneVision.git C:\Sandika\project\ToneVision

# Change to the project directory
cd C:\Sandika\project\ToneVision

# Build the release binary (optimised)
cargo build --release
```

After the build completes, the executable will be found at:
- Windows: `./target/release/tonevision.exe`
- macOS/Linux: `./target/release/tonevision`

---

## Running the Server

```powershell
# From the project root
./target/release/tonevision.exe
```

The server binds to port **8080** by default. If port `8080` is already in use, ToneVision will automatically increment the port (e.g. `8081`, `8082` up to `8100`) until it successfully binds to an available port.

---

## Configuration

Configuration is automatically generated on startup in a `config.json` file located in the working directory:

```json
{
  "admin_password": "admin",
  "keep_alive_mins": 10,
  "auto_open_browser": true
}
```

- `admin_password` – Password for the admin dashboard (default is `"admin"`).
- `keep_alive_mins` – Number of minutes to retain a room's text buffer history after a Transmitter disconnects.
- `auto_open_browser` – Automatically opens the landing page in the default web browser when the server starts.

---

## Networking

### Firewall

On Windows, you must allow inbound traffic on the chosen port (default **8080**). Run the following command in an Administrator PowerShell window:

```powershell
New-NetFirewallRule -DisplayName "ToneVision Local Server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080
```

### Client Access

Open a browser on any device connected to the same LAN and navigate to:

```
http://<HOST_IP>:8080
```

Replace `<HOST_IP>` with the IP address of the machine running the server.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Write tests and ensure `cargo test` passes.
4. Open a pull request describing the changes.

All code should be formatted with `cargo fmt` and linted with `cargo clippy`.

---

## License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

---

## Disclaimer

**IMPORTANT NOTICE: PLEASE READ CAREFULLY BEFORE USE.**

This software (**ToneVision**) is provided by the Developer **"as is"** and **"as available"** without warranty of any kind, either express, implied, statutory, or otherwise, including, but not limited to, the implied warranties of merchantability, fitness for a particular purpose, or non-infringement.

To the maximum extent permitted by applicable law, the Developer disclaims all liability and responsibility:
1. **No Warranty of Uptime or Accuracy:** The Developer does not guarantee that the software will be uninterrupted, secure, error-free, or free from data loss or transmission latency. Users assume all responsibility for verifying the accuracy of any real-time text streamed.
2. **No Guarantee of Accessibility Compliance:** While this software includes features to assist with visual accessibility, the Developer makes no representation or warranty that using this application guarantees compliance with any national, regional, or local accessibility laws, regulations, or standards (such as the Americans with Disabilities Act (ADA), WCAG, or equivalent regional guidelines).
3. **Limitation of Liability:** In no event shall the Developer be liable for any claim, damages, or other liability, whether in an action of contract, tort (including negligence), strict liability, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software, including without limitation direct, indirect, incidental, special, exemplary, or consequential damages.

---

*Created by the ToneVision team*

