// Parse URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room") ? urlParams.get("room").trim().toLowerCase() : "";
const pin = localStorage.getItem(`tv_pin_${roomId}`) || "";

// Redirect if parameters are invalid
if (!roomId || !pin) {
    alert("Invalid session. Redirecting to landing page.");
    window.location.href = "/";
}

// UI Elements
const editor = document.getElementById("editor");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const metaRoomId = document.getElementById("meta-room-id");
const metaRoomPin = document.getElementById("meta-room-pin");
const pairingUrlInput = document.getElementById("pairing-url");
const qrContainer = document.getElementById("qr-container");
const btnPause = document.getElementById("btn-pause");
const pausedAlert = document.getElementById("paused-alert");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");

// State
let socket = null;
let isPaused = false;
let reconnectTimer = null;
let heartbeatInterval = null;
let serverLanUrl = "";

// Initialize page metadata
metaRoomId.textContent = roomId;
metaRoomPin.textContent = pin;

// Pre-fill editor from localStorage if it exists
const savedBuffer = localStorage.getItem(`tv_buffer_${roomId}`);
if (savedBuffer) {
    editor.value = savedBuffer;
    updateStats();
}

// Setup WebSocket connection
function connectWebSocket() {
    clearTimeout(reconnectTimer);
    
    statusDot.className = "status-dot status-connecting";
    statusText.textContent = "Connecting...";

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/tx/${encodeURIComponent(roomId)}?pin=${encodeURIComponent(pin)}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        statusDot.className = "status-dot status-online";
        statusText.textContent = "Connected";
        fetchPairingInfo();
        
        // Start heartbeat ping every 25 seconds
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }));
            }
        }, 25000);
        
        // Sync our local state if we were paused
        socket.send(JSON.stringify({ type: "pause", paused: isPaused }));
        
        // Send initial buffer state
        if (editor.value) {
            socket.send(JSON.stringify({ type: "text", text: editor.value }));
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "text" && data.text && !editor.value) {
                // If editor is empty and server has cached history, sync it to editor
                editor.value = data.text;
                updateStats();
            }
        } catch (err) {
            console.error("Failed to parse socket message:", err);
        }
    };

    socket.onclose = (e) => {
        clearInterval(heartbeatInterval);
        statusDot.className = "status-dot status-offline";
        
        // Check if we were superseded/taken over by another connection
        if (e.code === 4001) {
            statusText.textContent = "Superseded by another session";
            alert("This typing session has been taken over by another transmitter connection.");
            window.location.href = "/";
            return;
        }

        // Check for specific error codes or auth failures
        if (e.code === 1008 || e.reason.includes("PIN")) {
            statusText.textContent = "Authentication Error";
            alert("Error: Incorrect PIN for this Room. Returning to landing page.");
            window.location.href = "/";
            return;
        }

        statusText.textContent = "Disconnected (Retrying...)";
        reconnectTimer = setTimeout(connectWebSocket, 4000);
    };

    socket.onerror = () => {
        socket.close();
    };
}

// Fetch network IP and QR SVG from backend
async function fetchPairingInfo() {
    try {
        const response = await fetch("/api/network");
        if (!response.ok) throw new Error();
        const network = await response.json();
        
        // Create full LAN Receiver URL
        serverLanUrl = `http://${network.local_ip}:${network.port}/rx/index.html?room=${encodeURIComponent(roomId)}`;
        pairingUrlInput.value = serverLanUrl;

        // Fetch SVG QR Code
        const qrResponse = await fetch(`/api/qr?url=${encodeURIComponent(serverLanUrl)}`);
        if (!qrResponse.ok) throw new Error();
        const svgContent = await qrResponse.text();
        qrContainer.innerHTML = svgContent;
    } catch (err) {
        console.error("Failed to fetch pairing details:", err);
        pairingUrlInput.value = `http://${window.location.host}/rx/index.html?room=${roomId}`;
        qrContainer.innerHTML = '<div class="qr-loading" style="color: var(--error);">Error generating QR code</div>';
    }
}

// Send text update to server
editor.addEventListener("input", () => {
    updateStats();
    
    // Save to local storage for recovery
    localStorage.setItem(`tv_buffer_${roomId}`, editor.value);

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "text",
            text: editor.value
        }));
    }
});

// Update word & character statistics
function updateStats() {
    const text = editor.value;
    charCount.textContent = text.length;
    
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = words.length;
}

// Toggle stream pause state
function togglePause() {
    isPaused = !isPaused;
    
    if (isPaused) {
        btnPause.className = "btn btn-pause active";
        btnPause.innerHTML = '<span class="btn-icon">▶</span> Resume Stream';
        pausedAlert.style.display = "block";
    } else {
        btnPause.className = "btn btn-pause";
        btnPause.innerHTML = '<span class="btn-icon">⏸</span> Pause Stream';
        pausedAlert.style.display = "none";
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "pause",
            paused: isPaused
        }));
    }
}

let clearConfirmTimeout = null;

// Clear stream buffer
function triggerClear() {
    console.log("triggerClear() button clicked");
    const btnClear = document.getElementById("btn-clear");
    
    if (btnClear.classList.contains("confirming")) {
        console.log("Clear confirmed. Cleaning local textarea and localStorage.");
        editor.value = "";
        updateStats();
        localStorage.removeItem(`tv_buffer_${roomId}`);

        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("Sending 'clear' message via WebSocket.");
            socket.send(JSON.stringify({
                type: "clear"
            }));
        } else {
            console.warn("WebSocket is not open. ReadyState:", socket ? socket.readyState : "null");
        }
        
        resetClearButton();
    } else {
        console.log("Entering clear confirmation state.");
        btnClear.classList.add("confirming");
        btnClear.innerHTML = '<span class="btn-icon">⚠️</span> Confirm Clear?';
        
        clearTimeout(clearConfirmTimeout);
        clearConfirmTimeout = setTimeout(resetClearButton, 3500);
    }
}

function resetClearButton() {
    const btnClear = document.getElementById("btn-clear");
    if (btnClear) {
        btnClear.classList.remove("confirming");
        btnClear.innerHTML = '<span class="btn-icon">🗑</span> Clear Stream';
    }
}

// Copy Pairing URL to clipboard
function copyPairingUrl() {
    const copyText = document.getElementById("pairing-url");
    const copyBtn = document.getElementById("btn-copy");

    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    navigator.clipboard.writeText(copyText.value)
        .then(() => {
            copyBtn.textContent = "Copied!";
            copyBtn.style.background = "var(--success)";
            setTimeout(() => {
                copyBtn.textContent = "Copy";
                copyBtn.style.background = "";
            }, 2000);
        })
        .catch(err => {
            console.error("Failed to copy pairing link: ", err);
        });
}

// Download stream content as a text file
function downloadStream() {
    const text = editor.value;
    if (!text.trim()) {
        alert("The stream is currently empty. Nothing to save.");
        return;
    }
    
    // Create blob and download link
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Generate timestamp for filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    
    link.href = url;
    link.download = `tonevision_stream_${roomId}_${timestamp}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Editor settings elements
const txSettingsPanel = document.getElementById("tx-settings-panel");
const txFontSelect = document.getElementById("tx-font-select");
const txFontSizeInput = document.getElementById("tx-font-size");
const txFontSizeDisplay = document.getElementById("tx-font-size-display");
const txThemeSelect = document.getElementById("tx-theme-select");
const textareaWrapper = document.querySelector(".textarea-wrapper");

// Load initial settings from localStorage
const txSettings = {
    fontFamily: localStorage.getItem("tv_tx_font") || "font-sans",
    fontScale: parseFloat(localStorage.getItem("tv_tx_scale")) || 1.2,
    theme: localStorage.getItem("tv_tx_theme") || "theme-default",
};

// Initialize Settings UI values
if (txFontSelect) txFontSelect.value = txSettings.fontFamily;
if (txFontSizeInput) {
    txFontSizeInput.value = txSettings.fontScale;
    txFontSizeDisplay.textContent = txSettings.fontScale.toFixed(1);
}
if (txThemeSelect) txThemeSelect.value = txSettings.theme;

// Apply initial settings
applyTxFont();
applyTxFontSize();
applyTxTheme();

// Toggle Settings Panel
function toggleTxSettingsPanel() {
    if (txSettingsPanel.style.display === "flex") {
        txSettingsPanel.style.display = "none";
        document.getElementById("btn-tx-settings").style.color = "var(--text-secondary)";
    } else {
        txSettingsPanel.style.display = "flex";
        document.getElementById("btn-tx-settings").style.color = "var(--accent)";
    }
}

// Apply font family
function applyTxFont() {
    txSettings.fontFamily = txFontSelect.value;
    localStorage.setItem("tv_tx_font", txSettings.fontFamily);
    
    textareaWrapper.className = textareaWrapper.className
        .split(" ")
        .filter(c => !c.startsWith("tx-font-"))
        .join(" ");
    
    textareaWrapper.classList.add(`tx-${txSettings.fontFamily}`);
}

// Apply font size
function applyTxFontSize() {
    const scale = parseFloat(txFontSizeInput.value);
    txSettings.fontScale = scale;
    txFontSizeDisplay.textContent = scale.toFixed(1);
    localStorage.setItem("tv_tx_scale", scale);
    
    editor.style.fontSize = `${scale}rem`;
}

// Apply theme
function applyTxTheme() {
    txSettings.theme = txThemeSelect.value;
    localStorage.setItem("tv_tx_theme", txSettings.theme);
    
    textareaWrapper.className = textareaWrapper.className
        .split(" ")
        .filter(c => !c.startsWith("tx-theme-"))
        .join(" ");
    
    textareaWrapper.classList.add(`tx-${txSettings.theme}`);
}

// Sidebar Toggle Logic
let sidebarHidden = localStorage.getItem("tv_tx_sidebar_hidden") === "true";

// Apply initial sidebar state
applySidebarState();

// Update arrow directions on window resize
window.addEventListener("resize", applySidebarState);

function toggleSidebar() {
    sidebarHidden = !sidebarHidden;
    localStorage.setItem("tv_tx_sidebar_hidden", sidebarHidden);
    applySidebarState();
}

function applySidebarState() {
    const layout = document.querySelector(".app-layout");
    const arrowIcon = document.getElementById("sidebar-arrow-icon");
    const isMobile = window.innerWidth <= 900;
    
    if (sidebarHidden) {
        layout.classList.add("sidebar-hidden");
        if (arrowIcon) {
            arrowIcon.textContent = isMobile ? "▼" : "▶";
        }
    } else {
        layout.classList.remove("sidebar-hidden");
        if (arrowIcon) {
            arrowIcon.textContent = isMobile ? "▲" : "◀";
        }
    }
}

// Connect immediately
connectWebSocket();
