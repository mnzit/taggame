// Serverless WebRTC logic (Adapted for Tag Game)
const peers = {}; // slot -> { pc, dc, connected, name }
let pairScan = null;
let maxPlayers = 4;

function broadcastToControllers(obj) {
    const s = JSON.stringify(obj);
    for (const k in peers) { 
        const dc = peers[k]?.dc; 
        if (dc && dc.readyState === 'open') { 
            try { dc.send(s); } catch (e) {} 
        } 
    }
}

function getConnectedPeers() {
    return Object.keys(peers).filter(k => peers[k].connected);
}

function updateHostLobby() {
    const list = document.getElementById('pair-list');
    if (!list) return;
    list.innerHTML = '';
    
    let connectedCount = 0;
    
    for (let s = 1; s <= maxPlayers; s++) {
        const connected = peers[s] && peers[s].connected;
        if (connected) connectedCount++;
        
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700';
        row.innerHTML = `
            <span class="text-sm font-bold ${connected ? 'text-indigo-300' : 'text-slate-500'}">
                ${peers[s]?.name || 'Player ' + s}
            </span>
            <span class="flex items-center gap-2">
                <span class="text-xs font-bold ${connected ? 'text-emerald-400' : 'text-slate-500'}">${connected ? 'Connected' : 'Waiting'}</span>
                <button onclick="hostPair(${s})" class="text-xs font-bold px-3 py-1.5 rounded-lg ${connected ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-indigo-600 text-white hover:bg-indigo-500'} transition-colors">${connected ? 'Re-pair' : 'Pair'}</button>
            </span>
        `;
        list.appendChild(row);
    }
    const maxCountEl = document.getElementById('max-players-count');
    if (maxCountEl) maxCountEl.innerText = maxPlayers;
    
    document.getElementById('player-count').innerText = connectedCount;
    
    const btnAdd = document.getElementById('btn-add-remote');
    if (btnAdd) {
        if (maxPlayers >= 10) {
            btnAdd.classList.add('hidden');
        } else {
            btnAdd.classList.remove('hidden');
        }
    }
    const startBtn = document.getElementById('btn-start');
    if (connectedCount > 0) {
        startBtn.classList.remove('hidden');
    } else {
        startBtn.classList.add('hidden');
    }
}

window.addRemoteSlot = function() {
    if (maxPlayers < 10) {
        maxPlayers++;
        updateHostLobby();
    }
};

function markSlotConnected(slot, ok) { 
    if (!peers[slot]) return;
    peers[slot].connected = ok; 
    updateHostLobby(); 
    
    // Notify game engine if player connected/disconnected
    if (window.gameEngine) {
        if (ok) window.gameEngine.addPlayer(slot, peers[slot].name || 'Player ' + slot);
        else window.gameEngine.removePlayer(slot);
    }
}

const RTC_CONFIG = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
] };

const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function b45encode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
            let x = bytes[i] * 256 + bytes[i + 1];
            const c = x % 45; x = (x - c) / 45; const d = x % 45; const e = (x - d) / 45;
            out += B45[c] + B45[d] + B45[e];
        } else {
            let x = bytes[i]; const c = x % 45; const d = (x - c) / 45;
            out += B45[c] + B45[d];
        }
    }
    return out;
}
function b45decode(str) {
    const out = [];
    for (let i = 0; i < str.length;) {
        const rem = str.length - i;
        if (rem >= 3) { const n = B45.indexOf(str[i]) + B45.indexOf(str[i + 1]) * 45 + B45.indexOf(str[i + 2]) * 2025; out.push((n >> 8) & 0xff, n & 0xff); i += 3; }
        else if (rem === 2) { const n = B45.indexOf(str[i]) + B45.indexOf(str[i + 1]) * 45; out.push(n & 0xff); i += 2; }
        else break;
    }
    return new Uint8Array(out);
}
function packSDP(desc) {
    const json = JSON.stringify({ t: desc.type[0], s: desc.sdp });
    return b45encode(pako.deflate(json));
}
function unpackSDP(str) {
    const j = JSON.parse(pako.inflate(b45decode(str.trim().toUpperCase()), { to: 'string' }));
    return { type: j.t === 'o' ? 'offer' : 'answer', sdp: j.s };
}
function waitIce(pc) {
    return new Promise(res => {
        if (pc.iceGatheringState === 'complete') return res();
        const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); res(); } };
        pc.addEventListener('icegatheringstatechange', done);
        setTimeout(res, 3500); 
    });
}
function watchIce(pc, setStatus) {
    pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'checking') setStatus('Connecting...');
        else if (s === 'connected' || s === 'completed') setStatus('Connected!');
        else if (s === 'failed') setStatus('Connection failed (same WiFi?)');
        else if (s === 'disconnected') setStatus('Disconnected');
    };
}

async function scanQR(videoEl, onResult) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = stream; await videoEl.play();
    const c = document.createElement('canvas'); const cx = c.getContext('2d');
    const ctrl = { stop() { cancelAnimationFrame(ctrl.raf); stream.getTracks().forEach(t => t.stop()); } };
    function tick() {
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            c.width = videoEl.videoWidth; c.height = videoEl.videoHeight;
            cx.drawImage(videoEl, 0, 0, c.width, c.height);
            const img = cx.getImageData(0, 0, c.width, c.height);
            const code = (typeof jsQR !== 'undefined') ? jsQR(img.data, img.width, img.height) : null;
            if (code && code.data) { ctrl.stop(); onResult(code.data); return; }
        }
        ctrl.raf = requestAnimationFrame(tick);
    }
    ctrl.raf = requestAnimationFrame(tick);
    return ctrl;
}

function makeQR(el, text) {
    const qr = qrcode(0, 'L');
    qr.addData(text.toUpperCase(), 'Alphanumeric');
    qr.make();
    const size = 250;
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    const svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('width', size); svg.setAttribute('height', size); svg.style.width = size + 'px'; svg.style.height = size + 'px'; svg.style.display = 'block'; }
}

// HOST LOGIC
async function hostPair(slot) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    watchIce(pc, (t) => { const el = document.getElementById('pair-status'); if (el) el.innerText = t; });
    const dc = pc.createDataChannel('ctrl');
    peers[slot] = { pc, dc, connected: false, name: '' };
    
    dc.onopen = () => { 
        markSlotConnected(slot, true); 
        closePairModal(); 
        try { dc.send(JSON.stringify({ a: 'welcome', slot: slot })); } catch (_) {} 
    };
    dc.onclose = () => markSlotConnected(slot, false);
    dc.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        
        // Handle input from controller
        if (m.a === 'name') {
            peers[slot].name = m.n;
            updateHostLobby();
            if (window.gameEngine) window.gameEngine.updatePlayerName(slot, m.n);
        } else if (m.a === 'move') {
            if (window.gameEngine) window.gameEngine.handlePlayerMove(slot, m.x, m.y);
        } else if (m.a === 'jump') {
            if (window.gameEngine) window.gameEngine.handlePlayerJump(slot, m.state);
        }
    };
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    
    document.getElementById('pair-title').innerText = 'Pair Player ' + slot;
    document.getElementById('pair-status').innerText = 'Starting camera...';
    makeQR(document.getElementById('pair-qr'), packSDP(pc.localDescription));
    
    const modal = document.getElementById('pair-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    window._pairSlot = slot;

    try {
        if (pairScan) pairScan.stop();
        pairScan = await scanQR(document.getElementById('pair-video'), async (data) => {
            try {
                const s = window._pairSlot;
                await peers[s].pc.setRemoteDescription(unpackSDP(data));
                document.getElementById('pair-status').innerText = 'Reply received, connecting...';
            } catch (e) { document.getElementById('pair-status').innerText = 'Invalid code, try again'; }
        });
        document.getElementById('pair-status').innerText = 'Scanning for reply...';
    } catch (e) { 
        document.getElementById('pair-status').innerText = 'Camera blocked/missing: ' + e.message; 
    }
}

function closePairModal() {
    if (pairScan) { pairScan.stop(); pairScan = null; }
    const modal = document.getElementById('pair-modal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

// JOIN LOGIC (Phone)
let joinPC = null, joinDC = null, joinScan = null;
function enterJoinMode() {
    document.getElementById('lobby-modal').classList.add('hidden');
    const ov = document.getElementById('join-overlay');
    ov.classList.remove('hidden'); ov.classList.add('flex');
    document.getElementById('join-step1').classList.remove('hidden');
    document.getElementById('join-step2').classList.add('hidden');
    document.getElementById('join-status').innerText = '';
}

async function joinStartScan() {
    document.getElementById('join-status').innerText = 'Point at the host code...';
    try {
        joinScan = await scanQR(document.getElementById('join-video'), async (data) => {
            try { await joinFromOffer(data); } catch (e) { document.getElementById('join-status').innerText = 'Invalid code, try again'; }
        });
    } catch (e) { document.getElementById('join-status').innerText = 'Camera blocked: ' + e.message; }
}

async function joinFromOffer(text) {
    if (joinScan) { joinScan.stop(); joinScan = null; }
    
    const pc = new RTCPeerConnection(RTC_CONFIG);
    watchIce(pc, (t) => { const el = document.getElementById('join-status'); if (el) el.innerText = t; });
    joinPC = pc;
    pc.ondatachannel = (e) => { joinDC = e.channel; wireJoinChannel(); };
    await pc.setRemoteDescription(unpackSDP(text));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await waitIce(pc);
    document.getElementById('join-step1').classList.add('hidden');
    document.getElementById('join-step2').classList.remove('hidden');
    document.getElementById('join-status').innerText = 'Show this to the host';
    makeQR(document.getElementById('join-qr'), packSDP(pc.localDescription));
}

function wireJoinChannel() {
    joinDC.onopen = () => {
        document.getElementById('join-overlay').classList.add('hidden');
        document.getElementById('join-overlay').classList.remove('flex');
        const prompt = document.getElementById('controller-name-prompt');
        prompt.classList.remove('hidden'); prompt.classList.add('flex');
    };
    joinDC.onclose = () => { 
        const s = document.getElementById('cv-status'); 
        if (s) { 
            s.innerText = 'disconnected'; 
            s.className = 'text-xs font-bold px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30'; 
        } 
    };
    joinDC.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.a === 'welcome') { 
            const el = document.getElementById('cv-name'); 
            if (el) el.innerText = 'Player ' + m.slot; 
        } else if (m.a === 'start') {
            // Host started game
        }
    };
}

function cvSend(obj) { 
    if (joinDC && joinDC.readyState === 'open') {
        joinDC.send(JSON.stringify(obj)); 
    }
}

// Init lobby
document.addEventListener("DOMContentLoaded", () => {
    updateHostLobby();
});
