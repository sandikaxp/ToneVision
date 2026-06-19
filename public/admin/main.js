// State
let adminPassword = sessionStorage.getItem("tv_admin_password") || "";
let pollInterval = null;

// UI Elements
const authOverlay = document.getElementById("auth-overlay");
const mainContainer = document.getElementById("main-container");
const roomsTableBody = document.getElementById("rooms-table-body");
const adminPassInput = document.getElementById("admin-pass-input");

// Listen for enter key in password input
adminPassInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        authenticateAdmin();
    }
});

// Run initial auth check
checkAuth();

function checkAuth() {
    if (adminPassword) {
        authOverlay.style.display = "none";
        mainContainer.style.display = "block";
        
        loadRoomsRegistry();
        loadConnectionsMonitor();
        loadServerSettings();
        
        // Start polling if not already started
        if (!pollInterval) {
            pollInterval = setInterval(() => {
                loadRoomsRegistry();
                loadConnectionsMonitor();
            }, 4000);
        }
    } else {
        authOverlay.style.display = "flex";
        mainContainer.style.display = "none";
        adminPassInput.value = "";
        adminPassInput.focus();
        
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
}

// Authenticate Admin locally first, dashboard will self-correct on 401
function authenticateAdmin() {
    const inputPass = adminPassInput.value.trim();
    if (!inputPass) {
        alert("Please enter a password.");
        return;
    }
    
    adminPassword = inputPass;
    sessionStorage.setItem("tv_admin_password", adminPassword);
    checkAuth();
}

function lockDashboard() {
    adminPassword = "";
    sessionStorage.removeItem("tv_admin_password");
    checkAuth();
}

// Fetch active rooms from server
async function loadRoomsRegistry() {
    try {
        const response = await fetch(`/api/rooms?password=${encodeURIComponent(adminPassword)}`);
        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) throw new Error("Failed to load rooms database");
        const rooms = await response.json();

        if (rooms.length === 0) {
            roomsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-data">No active rooms in the database. Pre-create one on the left!</td>
                </tr>
            `;
            return;
        }

        roomsTableBody.innerHTML = "";
        rooms.forEach(room => {
            const tr = document.createElement("tr");

            // Room ID
            const tdId = document.createElement("td");
            tdId.style.fontWeight = "600";
            tdId.textContent = room.room_id;
            tr.appendChild(tdId);

            // PIN
            const tdPin = document.createElement("td");
            tdPin.style.fontFamily = "monospace";
            tdPin.textContent = room.pin || "****";
            tr.appendChild(tdPin);

            // Typist Connection Status
            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `badge ${room.tx_connected ? 'badge-active' : 'badge-offline'}`;
            badge.textContent = room.tx_connected ? "Active" : "Offline";
            tdStatus.appendChild(badge);
            tr.appendChild(tdStatus);

            // Stream state (Paused/Streaming)
            const tdStream = document.createElement("td");
            const streamBadge = document.createElement("span");
            if (room.paused) {
                streamBadge.className = "badge badge-paused";
                streamBadge.textContent = "Paused";
            } else {
                streamBadge.className = room.tx_connected ? "badge-active" : "badge-offline";
                streamBadge.textContent = room.tx_connected ? "Streaming" : "Idle";
            }
            tdStream.appendChild(streamBadge);
            tr.appendChild(tdStream);

            // Action: Delete Room
            const tdActions = document.createElement("td");
            const delBtn = document.createElement("button");
            delBtn.className = "btn-delete";
            delBtn.textContent = "Delete Room";
            delBtn.onclick = () => deleteRoom(room.room_id);
            tdActions.appendChild(delBtn);
            tr.appendChild(tdActions);

            roomsTableBody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error reading room registry:", err);
    }
}

// Pre-create room (Admin POST /api/rooms)
async function preCreateRoom() {
    const roomIdEl = document.getElementById("new-room-id");
    const pinEl = document.getElementById("new-room-pin");

    const roomId = roomIdEl.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    const pin = pinEl.value.trim();

    if (!roomId) {
        alert("Please enter a valid Room ID.");
        roomIdEl.focus();
        return;
    }
    if (pin.length !== 4 || isNaN(pin)) {
        alert("Please enter a 4-digit numeric PIN.");
        pinEl.focus();
        return;
    }

    try {
        const response = await fetch("/api/rooms", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                room_id: roomId,
                pin: pin,
                password: adminPassword
            })
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || "Failed to create room");
        }

        // Success
        roomIdEl.value = "";
        pinEl.value = "";
        alert(`Room "${roomId}" pre-created successfully!`);
        loadRoomsRegistry();
    } catch (err) {
        alert(`Error pre-creating room: ${err.message}`);
    }
}

// Delete room (Admin DELETE /api/rooms/:room_id)
async function deleteRoom(roomId) {
    if (!confirm(`Are you sure you want to delete room "${roomId}"? All typist buffers and reader feeds will be cleared.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}?password=${encodeURIComponent(adminPassword)}`, {
            method: "DELETE"
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || "Failed to delete room");
        }

        loadRoomsRegistry();
    } catch (err) {
        alert(`Error deleting room: ${err.message}`);
    }
}

// Fetch current server settings from backend
async function loadServerSettings() {
    try {
        const response = await fetch(`/api/admin/settings?password=${encodeURIComponent(adminPassword)}`);
        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) throw new Error("Failed to load settings");
        const config = await response.json();

        document.getElementById("settings-keep-alive").value = config.keep_alive_mins;
        document.getElementById("settings-auto-open").checked = config.auto_open_browser;
    } catch (err) {
        console.error("Error loading server settings:", err);
    }
}

// Save server settings to backend
async function saveAdminSettings() {
    const newPassEl = document.getElementById("settings-new-password");
    const keepAliveEl = document.getElementById("settings-keep-alive");
    const autoOpenEl = document.getElementById("settings-auto-open");

    const newPass = newPassEl.value.trim();
    const keepAlive = parseInt(keepAliveEl.value);
    const autoOpen = autoOpenEl.checked;

    const payload = {
        password: adminPassword,
        keep_alive_mins: keepAlive,
        auto_open_browser: autoOpen
    };

    if (newPass) {
        payload.new_password = newPass;
    }

    try {
        const response = await fetch("/api/admin/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) throw new Error(await response.text());

        if (newPass) {
            adminPassword = newPass;
            sessionStorage.setItem("tv_admin_password", adminPassword);
            newPassEl.value = "";
        }
        alert("Settings saved successfully!");
        loadServerSettings();
    } catch (err) {
        alert("Error saving settings: " + err.message);
    }
}

// Reset server data (factory reset)
async function factoryResetServer() {
    if (!confirm("WARNING: Are you sure you want to perform a Factory Reset? This will delete all rooms, disconnect all active typists and readers, and clear all text history from the database!")) {
        return;
    }

    try {
        const response = await fetch("/api/admin/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: adminPassword })
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) throw new Error(await response.text());

        alert("Server database reset successfully!");
        loadRoomsRegistry();
        loadConnectionsMonitor();
    } catch (err) {
        alert("Error resetting server: " + err.message);
    }
}

// Load and display active client connections
async function loadConnectionsMonitor() {
    const tableBody = document.getElementById("connections-table-body");
    try {
        const response = await fetch(`/api/admin/connections?password=${encodeURIComponent(adminPassword)}`);
        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) throw new Error("Failed to load connections");
        const connections = await response.json();

        if (connections.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="no-data">No active client connections.</td>
                </tr>
            `;
            return;
        }

        const nowSecs = Math.floor(Date.now() / 1000);

        tableBody.innerHTML = "";
        connections.forEach(conn => {
            const tr = document.createElement("tr");

            // IP Address
            const tdIp = document.createElement("td");
            tdIp.style.fontFamily = "monospace";
            tdIp.textContent = conn.ip;
            tr.appendChild(tdIp);

            // Role badge
            const tdRole = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `badge ${conn.role === 'Typist' ? 'badge-active' : 'badge-offline'}`;
            badge.textContent = conn.role;
            tdRole.appendChild(badge);
            tr.appendChild(tdRole);

            // Room ID
            const tdRoom = document.createElement("td");
            tdRoom.style.fontWeight = "600";
            tdRoom.textContent = conn.room_id;
            tr.appendChild(tdRoom);

            // Uptime duration
            const tdUptime = document.createElement("td");
            const durationSecs = Math.max(0, nowSecs - conn.connected_at_secs);
            tdUptime.textContent = formatDuration(durationSecs);
            tr.appendChild(tdUptime);

            tableBody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error loading connections monitor:", err);
    }
}

function formatDuration(secs) {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
}

function handleUnauthorized() {
    alert("Session expired or invalid admin password. Please re-authenticate.");
    lockDashboard();
}
