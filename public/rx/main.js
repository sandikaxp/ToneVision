// Parse URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room") ? urlParams.get("room").trim().toLowerCase() : "";

// Redirect if Room ID is missing
if (!roomId) {
    alert("Please select or enter a Room ID to join.");
    window.location.href = "/";
}

// UI Elements
const readerView = document.getElementById("reader-view");
const readerContainer = document.getElementById("reader-container");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const roomNameDisplay = document.getElementById("room-name");
const pausedBanner = document.getElementById("paused-banner");
const settingsPanel = document.getElementById("settings-panel");

// Settings Elements
const themeSelect = document.getElementById("theme-select");
const fontSelect = document.getElementById("font-select");
const fontScaleInput = document.getElementById("font-scale");
const fontScaleDisplay = document.getElementById("font-scale-display");
const focusModeToggle = document.getElementById("focus-mode-toggle");
const bionicToggle = document.getElementById("bionic-toggle");

// State variables
let socket = null;
let reconnectTimer = null;
let heartbeatInterval = null;
let rawText = "";
let isPaused = false;
let lastActiveSentenceTop = -1;

// Initialize metadata displays
roomNameDisplay.textContent = roomId;

// 1. Accessibility State & Local Storage Management
const settings = {
    theme: localStorage.getItem("tv_rx_theme") || "theme-navy",
    fontFamily: localStorage.getItem("tv_rx_font") || "font-sans",
    fontScale: parseFloat(localStorage.getItem("tv_rx_scale")) || 2.0,
    focusMode: localStorage.getItem("tv_rx_focus_mode") !== "false", // default true
    bionicMode: localStorage.getItem("tv_rx_bionic") === "true", // default false
};

// Initialize Settings UI values
themeSelect.value = settings.theme;
fontSelect.value = settings.fontFamily;
fontScaleInput.value = settings.fontScale;
fontScaleDisplay.textContent = settings.fontScale.toFixed(1);
focusModeToggle.checked = settings.focusMode;
bionicToggle.checked = settings.bionicMode;

// Apply settings initially
applyTheme();
applyFontFamily();
applyFontScale();
toggleFocusModeClass();

// Apply visual themes
function applyTheme() {
    settings.theme = themeSelect.value;
    localStorage.setItem("tv_rx_theme", settings.theme);
    
    // Reset theme classes on body
    document.body.className = document.body.className
        .split(" ")
        .filter(c => !c.startsWith("theme-"))
        .join(" ");
    
    document.body.classList.add(settings.theme);
}

// Apply font family selections
function applyFontFamily() {
    settings.fontFamily = fontSelect.value;
    localStorage.setItem("tv_rx_font", settings.fontFamily);
    
    // Reset font classes on body
    document.body.className = document.body.className
        .split(" ")
        .filter(c => !c.startsWith("font-"))
        .join(" ");
    
    document.body.classList.add(settings.fontFamily);
}

// Apply font scaling
function applyFontScale() {
    const scale = parseFloat(fontScaleInput.value);
    settings.fontScale = scale;
    fontScaleDisplay.textContent = scale.toFixed(1);
    localStorage.setItem("tv_rx_scale", scale);
    
    document.documentElement.style.setProperty("--font-scale", scale);
}

// Toggle Cognitive Focus Mode
function toggleFocusMode() {
    settings.focusMode = focusModeToggle.checked;
    localStorage.setItem("tv_rx_focus_mode", settings.focusMode);
    toggleFocusModeClass();
    renderText();
}

function toggleFocusModeClass() {
    if (settings.focusMode) {
        document.body.classList.add("focus-mode-enabled");
    } else {
        document.body.classList.remove("focus-mode-enabled");
    }
}

// Toggle Bionic Reading
function toggleBionicMode() {
    settings.bionicMode = bionicToggle.checked;
    localStorage.setItem("tv_rx_bionic", settings.bionicMode);
    renderText();
}

// Toggle Settings panel visibility
function toggleSettingsPanel() {
    if (settingsPanel.style.display === "flex") {
        settingsPanel.style.display = "none";
    } else {
        settingsPanel.style.display = "flex";
    }
}

// 2. WebSocket Connection & Handshake
function connectWebSocket() {
    clearTimeout(reconnectTimer);
    
    statusDot.className = "status-dot status-connecting";
    statusText.textContent = "Connecting...";

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/rx/${encodeURIComponent(roomId)}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        statusDot.className = "status-dot status-online";
        statusText.textContent = "Connected";

        // Start heartbeat ping every 25 seconds
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }));
            }
        }, 25000);
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === "text") {
                rawText = data.text;
                renderText();
            } else if (data.type === "pause") {
                isPaused = data.paused;
                pausedBanner.style.display = isPaused ? "block" : "none";
            } else if (data.type === "clear") {
                rawText = "";
                renderText();
            }
        } catch (err) {
            console.error("Failed to parse websocket message:", err);
        }
    };

    socket.onclose = () => {
        clearInterval(heartbeatInterval);
        statusDot.className = "status-dot status-offline";
        statusText.textContent = "Disconnected (Retrying...)";
        reconnectTimer = setTimeout(connectWebSocket, 4000);
    };

    socket.onerror = () => {
        socket.close();
    };
}

// 3. Cognitive Focus & Bionic Reading Engine
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function applyBionic(word) {
    if (word.length <= 1) return `<b>${word}</b>`;
    const boldLength = Math.ceil(word.length * 0.4) || 1;
    const boldPart = word.substring(0, boldLength);
    const restPart = word.substring(boldLength);
    return `<b>${boldPart}</b>${restPart}`;
}

function formatSentenceText(sentenceText, useBionic) {
    if (!useBionic) return escapeHtml(sentenceText);
    
    // Split on words to isolate letters to bold
    const tokens = sentenceText.split(/([a-zA-Z0-9']+)/g);
    return tokens.map(token => {
        if (/^[a-zA-Z0-9']+$/.test(token)) {
            return applyBionic(token);
        }
        return escapeHtml(token);
    }).join("");
}

function splitIntoSentences(text) {
    if (!text) return [];
    
    // Match sentences (split by punctuation, keeping punctuation with the sentence)
    const sentenceRegex = /[^.!?]+[.!?]*/g;
    const matches = text.match(sentenceRegex) || [];
    
    // Handle currently typed characters (with no ending punctuation yet)
    let matchedLength = matches.reduce((acc, m) => acc + m.length, 0);
    if (matchedLength < text.length) {
        matches.push(text.substring(matchedLength));
    }
    
    return matches;
}

function renderText() {
    if (!rawText.trim()) {
        readerView.innerHTML = '<div class="placeholder-text">Waiting for transmitter to begin typing...</div>';
        return;
    }

    const sentences = splitIntoSentences(rawText);
    const totalSentences = sentences.length;
    
    let htmlContent = "";
    
    sentences.forEach((sentence, index) => {
        const isLast = (index === totalSentences - 1);
        const className = isLast ? "sentence active" : "sentence faded";
        const formattedText = formatSentenceText(sentence, settings.bionicMode);
        
        htmlContent += `<span class="${className}">${formattedText}</span>`;
        if (!isLast) {
            htmlContent += '<span class="sentence-space"> </span>';
        }
    });

    // Add scroll sentinel at the very end of the text to represent the typing cursor
    htmlContent += '<span id="scroll-sentinel" style="display: inline-block; width: 0;">&#8203;</span>';
    
    readerView.innerHTML = htmlContent;

    // Wait for the browser to reflow and layout before checking positions and scrolling
    requestAnimationFrame(() => {
        const sentinel = readerView.querySelector("#scroll-sentinel");
        if (sentinel) {
            const containerRect = readerContainer.getBoundingClientRect();
            const sentinelRect = sentinel.getBoundingClientRect();
            
            const sentinelCenter = sentinelRect.top + sentinelRect.height / 2;
            const containerCenter = containerRect.top + containerRect.height / 2;
            const distance = Math.abs(sentinelCenter - containerCenter);
            
            // If the cursor line is more than 30px away from the center, scroll it smoothly to the center
            if (distance > 30) {
                sentinel.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        } else {
            readerContainer.scrollTop = readerContainer.scrollHeight;
        }
    });
}

// Start WebSocket connection
connectWebSocket();
