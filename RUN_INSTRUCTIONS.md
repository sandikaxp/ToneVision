# ToneVision – Run Instructions

This guide provides concise steps to **configure firewalls** and **run the ToneVision executable** on Windows, macOS, and Linux.

---

## 💻 Windows Setup

### 1. Firewall Exception (Port 8080)
To allow other devices on your local network to connect, you must allow traffic on port `8080`.

#### Option A: PowerShell (recommended)
Open PowerShell as an Administrator and execute:
```powershell
New-NetFirewallRule -DisplayName "ToneVision Local Server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080
```

#### Option B: Windows Defender UI
1. Press `Win + R`, type `firewall.cpl`, and press **Enter**.
2. Click **Advanced settings** in the left sidebar.
3. Select **Inbound Rules** (left pane) and click **New Rule…** (right pane).
4. Choose **Port** -> **TCP** -> enter `8080` in **Specific local ports**.
5. Select **Allow the connection** -> keep all profiles checked -> name the rule **ToneVision** and click **Finish**.

### 2. Running the Server
Open a command prompt (or PowerShell) in the directory where `tonevision.exe` is located and run:
```powershell
.\tonevision.exe
```
Or simply **double-click** the `tonevision.exe` file.
*Note: ToneVision will run in the background and place a **ToneVision** icon in your system tray (notification area) for quick access and control.*

---

## 🍎 macOS Setup

### 1. Permissions & Firewall
When you launch ToneVision for the first time, macOS may ask for permissions to allow incoming connections. Click **Allow**.

If you have the macOS Application Firewall turned on:
1. Go to **System Settings > Network > Firewall > Options...**
2. Ensure that incoming connections are not blocked, or add the compiled `tonevision` binary to the allowed list.

### 2. Running the Server
Open a Terminal in the directory where the `tonevision` file is located, make it executable, and run it:
```bash
chmod +x ./tonevision
./tonevision
```

---

## 🐧 Linux Setup

### 1. Firewall Configuration (Port 8080)
If your Linux system has an active firewall (like `ufw` or `firewalld`), you need to open port `8080`.

#### For UFW (Ubuntu/Debian):
```bash
sudo ufw allow 8080/tcp
```

#### For Firewalld (Fedora/CentOS/RHEL):
```bash
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

### 2. Running the Server
Open a terminal in the directory where the `tonevision` file is located, make it executable, and run it:
```bash
chmod +x ./tonevision
./tonevision
```

---

## 🌐 Verifying the Server & Connecting Devices

Upon startup, the console will print connection details like:
```text
==================================================
 ToneVision Local Server Starting...
--------------------------------------------------
 Local Loopback URL: http://localhost:8080
 LAN Broadcast URL:  http://192.168.1.50:8080
==================================================
```

1. **Local Access**: Open a browser on the host machine and navigate to the landing page at `http://localhost:8080`.
2. **Local Area Network (LAN) Access**: On other devices (phones, tablets, e-readers) connected to the same Wi-Fi network, navigate to the **LAN Broadcast URL** (replace `192.168.1.50` with the IP address printed on your server console).
3. **Automatic Port Fallback**: If port `8080` is in use, ToneVision will automatically bind to the next available port (e.g., `8081`, `8082`). Check the console output for the active port.

---

## ⚖️ Legal Disclaimer

**IMPORTANT NOTICE: PLEASE READ CAREFULLY BEFORE USE.**

This software (**ToneVision**) is provided by the Developer **"as is"** and **"as available"** without warranty of any kind, either express, implied, statutory, or otherwise, including, but not limited to, the implied warranties of merchantability, fitness for a particular purpose, or non-infringement.

To the maximum extent permitted by applicable law, the Developer disclaims all liability and responsibility:
1. **No Warranty of Uptime or Accuracy:** The Developer does not guarantee that the software will be uninterrupted, secure, error-free, or free from data loss or transmission latency. Users assume all responsibility for verifying the accuracy of any real-time text streamed.
2. **No Guarantee of Accessibility Compliance:** While this software includes features to assist with visual accessibility, the Developer makes no representation or warranty that using this application guarantees compliance with any national, regional, or local accessibility laws, regulations, or standards (such as the Americans with Disabilities Act (ADA), WCAG, or equivalent regional guidelines).
3. **Limitation of Liability:** In no event shall the Developer be liable for any claim, damages, or other liability, whether in an action of contract, tort (including negligence), strict liability, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software, including without limitation direct, indirect, incidental, special, exemplary, or consequential damages.

