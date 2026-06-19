# ToneVision: Installation & Setup Guide

This guide details how to build, configure, and run the **ToneVision** local server on your network across Windows, macOS, and Linux.

---

## 1. Prerequisites

Before building or running the application, ensure you have the following ready:

### ⚙️ Cross-Platform Requirements
* **Local Network (LAN)**: The host computer and all reader devices (tablets, phones, Smart TVs) must be connected to the same Wi-Fi or wired local network.
* **Rust & Cargo**: Required to compile the backend. Install it via [rustup.rs](https://rustup.rs/).

### 💻 Windows Prerequisites
* **C++ Build Tools**: Download and install the Visual Studio Build Tools (ensure the C++ workload is selected during installation) to compile native dependencies.

### 🍎 macOS Prerequisites
* **Xcode Command Line Tools**: Run the following in your terminal to install the compiler toolchain:
  ```bash
  xcode-select --install
  ```

### 🐧 Linux Prerequisites
* **Build Essentials**: Install GCC and make packages.
  * For Ubuntu/Debian: `sudo apt update && sudo apt install build-essential`
  * For Fedora/RHEL: `sudo dnf groupinstall "Development Tools"`

---

## 2. Firewall Configuration (Required for LAN Access)

By default, operating systems block incoming network connections to unauthorized ports. You must allow traffic on port `8080` so other devices can access the Receiver views.

### 💻 Windows Firewall
Open PowerShell as an Administrator and run:
```powershell
New-NetFirewallRule -DisplayName "ToneVision Local Server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080
```

### 🍎 macOS Firewall
1. Go to **System Settings > Network > Firewall > Options...**
2. Ensure that incoming connections are not blocked, or add the compiled `tonevision` binary to the allowed list.

### 🐧 Linux Firewall
* **UFW (Ubuntu/Debian)**:
  ```bash
  sudo ufw allow 8080/tcp
  ```
* **Firewalld (Fedora/RHEL)**:
  ```bash
  sudo firewall-cmd --add-port=8080/tcp --permanent
  sudo firewall-cmd --reload
  ```

---

## 3. Building the Application

To compile the application into a single, optimized standalone binary:

1. Open your terminal in the `ToneVision` project directory.
2. Run the compiler:
   ```bash
   cargo build --release
   ```
3. Once completed, the standalone executable will be located at:
   * **Windows**: `./target/release/tonevision.exe`
   * **macOS**: `./target/release/tonevision`
   * **Linux**: `./target/release/tonevision`

---

## 4. Launching the Server

Run the compiled executable or launch it during development using Cargo:

```bash
cargo run
```

Upon startup, the server automatically detects your network interface's local IP address and prints connection links in the console:
```text
==================================================
 ToneVision Local Server Starting...
--------------------------------------------------
 Local Loopback URL: http://localhost:8080
 LAN Broadcast URL:  http://192.168.1.50:8080
==================================================
```

*Note: If port `8080` is in use by another application, ToneVision automatically increments the port (e.g. `8081`, `8082`) until a free port is bound.*

### Windows System Tray Integration
On Windows, running the server will automatically create a **ToneVision** icon in your system tray (notification area).
* **Open ToneVision**: Right-click the tray icon and select **"Open ToneVision"** to open the landing page.
* **Open Admin Console**: Right-click the tray icon and select **"Open Admin Console"** to open the admin dashboard.
* **Graceful Exit**: Right-click the tray icon and select **"Quit"** to close the server.
*(Note: System tray integration is a no-op on macOS and Linux; the server is controlled entirely through the console terminal).*

---

## 5. Connecting Devices

Once the server is running and the firewall rule is applied:

### For the Typist (Transmitter):
* Open a browser on the host computer and go to the Admin Panel:
  `http://localhost:8080/admin/index.html` (Enter the default password: **`admin`**).
* Click **Create Room**, choose a **Room ID**, and assign a **4-digit PIN**.
* Navigate to the landing page `http://localhost:8080/`, find your pre-created room under the **Active Rooms Directory**, click **Type**, enter the PIN, and start typing.

### For the Readers (Receivers):
* Connect to the same local network (Wi-Fi or LAN).
* **Scan the QR Code** displayed on the Typist's sidebar, or enter the **LAN Broadcast URL** shared by the typist in any browser:
  `http://<LAN_IP>:8080/rx/index.html?room=<room_id>`
