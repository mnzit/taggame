// Game Maps Registry - Easily extendible by adding new objects
const GAME_MAPS = {
    '5_floors': {
        name: '5 Floors',
        build: (w, h) => {
            const p = [];
            // Ground floor
            p.push({ x: 0, y: h - 40, width: w, height: 40 });
            
            // 3 elevated floors (removed the very top one)
            const gap = (h - 150) / 4; // keep the gap distance the same, just less floors
            for(let i = 1; i <= 3; i++) {
                const y = h - 40 - (i * gap);
                
                // Create randomized platform segments for this floor level
                let numSegments = 2 + Math.floor(Math.random() * 2); // 2 or 3 segments per floor
                let availableWidth = w / numSegments;
                
                for(let j = 0; j < numSegments; j++) {
                    // Random width between 15% and 25% of screen width
                    let pw = w * (0.15 + Math.random() * 0.1); 
                    // Random x position within this segment's allocated zone
                    let px = (j * availableWidth) + Math.random() * (availableWidth - pw);
                    p.push({ x: px, y: y, width: pw, height: 20 });
                }
            }
            return p;
        }
    },
    'random': {
        name: 'Random Chaos',
        build: (w, h) => {
            const p = [];
            p.push({ x: 0, y: h - 40, width: w, height: 40 });
            const numPlatforms = Math.floor((w * h) / 100000);
            for (let i = 0; i < numPlatforms; i++) {
                const pw = 150 + Math.random() * 200;
                const px = Math.random() * (w - pw);
                const py = 150 + Math.random() * (h - 250);
                p.push({ x: px, y: py, width: pw, height: 20 });
            }
            return p;
        }
    }
};

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.players = {};
        this.platforms = [];
        this.currentMapId = '5_floors';
        this.lastTime = 0;
        this.isRunning = false;
        
        // Physics constants
        this.gravity = 800; // pixels per second squared
        this.moveSpeed = 400; // pixels per second
        this.jumpForce = -800; // significantly increased jump power
        this.maxFallSpeed = 1000;
        
        // Tag Logic
        this.itPlayerId = null;
        this.tagCooldown = 0; // ms
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Re-generate platforms if not running to fit screen
        if (!this.isRunning) {
            this.loadMap();
        }
    }

    setMap(mapId) {
        if (GAME_MAPS[mapId]) {
            this.currentMapId = mapId;
            if (!this.isRunning) this.loadMap();
        }
    }

    addPlayer(id, name) {
        const colors = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24', '#a855f7'];
        const colorIndex = typeof id === 'number' ? (id - 1) % colors.length : Object.keys(this.players).length % colors.length;
        
        this.players[id] = {
            id: id,
            name: name,
            x: Math.random() * (this.canvas.width - 100) + 50,
            y: 50,
            width: 40,
            height: 40,
            vx: 0,
            vy: 0,
            color: colors[colorIndex],
            inputX: 0,
            isJumping: false,
            grounded: false,
            stunTimer: 0
        };
        
        // If first player, make them IT
        if (!this.itPlayerId) {
            this.itPlayerId = id;
        }
    }

    removePlayer(id) {
        delete this.players[id];
        if (this.itPlayerId === id) {
            const remaining = Object.keys(this.players);
            this.itPlayerId = remaining.length > 0 ? remaining[0] : null;
        }
    }

    updatePlayerName(id, name) {
        if (this.players[id]) this.players[id].name = name;
    }

    handlePlayerMove(id, x, y) {
        if (this.players[id]) {
            this.players[id].inputX = x;
        }
    }

    handlePlayerJump(id, state) {
        if (this.players[id]) {
            if (state && this.players[id].grounded) {
                this.players[id].vy = this.jumpForce;
                this.players[id].grounded = false;
            }
        }
    }

    loadMap() {
        if (GAME_MAPS[this.currentMapId]) {
            this.platforms = GAME_MAPS[this.currentMapId].build(this.canvas.width, this.canvas.height);
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.loadMap();
        
        // Reset player positions
        Object.values(this.players).forEach(p => {
            p.x = Math.random() * (this.canvas.width - 100) + 50;
            p.y = 50;
            p.vx = 0;
            p.vy = 0;
        });
        
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
        
        // Notify phones
        broadcastToControllers({ a: 'start' });
    }

    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    loop(timestamp) {
        if (!this.isRunning) return;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        
        if (this.tagCooldown > 0) {
            this.tagCooldown -= dt * 1000;
        }

        this.updatePhysics(dt);
        this.checkTagging();
        this.draw();
        
        requestAnimationFrame((t) => this.loop(t));
    }

    updatePhysics(dt) {
        const pList = Object.values(this.players);
        
        pList.forEach(p => {
            // Handle Stun
            if (p.stunTimer > 0) {
                p.stunTimer -= dt * 1000;
                p.vx = 0; // Frozen horizontally
            } else {
                // Apply horizontal input
                p.vx = p.inputX * this.moveSpeed;
            }
            
            // Apply gravity
            p.vy += this.gravity * dt;
            if (p.vy > this.maxFallSpeed) p.vy = this.maxFallSpeed;
            
            // Move X
            p.x += p.vx * dt;
            
            // Screen walls X (Left and Right)
            if (p.x < 0) {
                p.x = 0;
                p.vx = 0;
            } else if (p.x + p.width > this.canvas.width) {
                p.x = this.canvas.width - p.width;
                p.vx = 0;
            }
            
            // Move Y
            p.y += p.vy * dt;
            p.grounded = false;
            
            // Screen ceiling (Top)
            if (p.y < 0) {
                p.y = 0;
                if (p.vy < 0) p.vy = 0; // stop upward momentum
            }
            
            // Platform collisions
            this.platforms.forEach(plat => {
                // Simple AABB, only collide if falling down
                if (p.vy >= 0 && 
                    p.y + p.height - (p.vy * dt) <= plat.y + 5 && // was above platform last frame
                    p.x + p.width > plat.x && 
                    p.x < plat.x + plat.width && 
                    p.y + p.height >= plat.y) {
                    
                    p.y = plat.y - p.height;
                    p.vy = 0;
                    p.grounded = true;
                }
            });
            
            // Ceiling / Floor bounds fallback
            if (p.y + p.height > this.canvas.height) {
                p.y = this.canvas.height - p.height;
                p.vy = 0;
                p.grounded = true;
            }
        });
    }

    checkTagging() {
        if (this.tagCooldown > 0) return;
        
        const itPlayer = this.players[this.itPlayerId];
        if (!itPlayer) return;
        
        let taggedSomeone = false;
        Object.values(this.players).forEach(p => {
            if (taggedSomeone) return;
            if (p.id !== this.itPlayerId) {
                if (this.checkCollision(itPlayer, p)) {
                    // Tag!
                    this.itPlayerId = p.id;
                    this.tagCooldown = 2000; // 2 seconds global tag cooldown
                    
                    // Freeze the new IT player for 1.5 seconds so the old IT can run
                    p.stunTimer = 1500;
                    
                    // Add a tiny bounce effect to separate them
                    itPlayer.vy = -300;
                    p.vy = -200;
                    
                    taggedSomeone = true;
                }
            }
        });
    }

    draw() {
        // Clear background
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw platforms
        this.ctx.fillStyle = '#334155';
        this.platforms.forEach(plat => {
            this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
            // Highlight top edge
            this.ctx.fillStyle = '#475569';
            this.ctx.fillRect(plat.x, plat.y, plat.width, 4);
            this.ctx.fillStyle = '#334155';
        });
        
        // Draw players
        Object.values(this.players).forEach(p => {
            const isIt = p.id === this.itPlayerId;
            
            if (isIt) {
                // If on cooldown, blink or show grey-ish red
                if (this.tagCooldown > 0) {
                    this.ctx.fillStyle = (Math.floor(performance.now() / 200) % 2 === 0) ? '#ef4444' : '#fca5a5';
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#fca5a5';
                } else {
                    this.ctx.shadowBlur = 20;
                    this.ctx.shadowColor = '#ef4444';
                    this.ctx.fillStyle = '#ef4444'; // Red for IT
                }
            } else {
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = p.color;
                
                // If this normal player is stunned (rare, but possible if mechanics change)
                if (p.stunTimer > 0) {
                    this.ctx.globalAlpha = 0.5;
                }
            }
            
            // Draw square
            this.ctx.fillRect(p.x, p.y, p.width, p.height);
            this.ctx.globalAlpha = 1.0;
            
            // Reset shadow
            this.ctx.shadowBlur = 0;
            
            // Draw Name
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px "Inter"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.name, p.x + p.width/2, p.y - 10);
            
            // Draw 'IT' tag
            if (isIt) {
                this.ctx.fillStyle = '#ef4444';
                this.ctx.font = 'bold 16px "Fredoka"';
                let text = 'IT!';
                if (this.tagCooldown > 0) text = 'COOLDOWN';
                if (p.stunTimer > 0) text = 'FROZEN!';
                this.ctx.fillText(text, p.x + p.width/2, p.y - 28);
            }
        });
    }
}

// Global initialization
window.gameEngine = new GameEngine();

window.joinLocal = function() {
    if (window.gameEngine && !window.gameEngine.players['local']) {
        window.gameEngine.addPlayer('local', 'Host (PC)');
        const btn = document.getElementById('btn-join-local');
        btn.innerText = 'LOCAL PLAYER JOINED';
        btn.classList.replace('bg-blue-500', 'bg-slate-600');
        btn.classList.replace('hover:bg-blue-400', 'hover:bg-slate-600');
        btn.disabled = true;
        
        const countEl = document.getElementById('player-count');
        countEl.innerText = parseInt(countEl.innerText) + 1;
        document.getElementById('btn-start').classList.remove('hidden');
    }
};

window.startGame = function() {
    document.getElementById('lobby-modal').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    window.gameEngine.start();
};

// Local Keyboard Controls
window.addEventListener('keydown', (e) => {
    if (!window.gameEngine || !window.gameEngine.isRunning) return;
    const p = window.gameEngine.players['local'];
    if (!p) return;

    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        window.gameEngine.handlePlayerJump('local', true);
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        window.gameEngine.handlePlayerMove('local', -1, 0);
    }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        window.gameEngine.handlePlayerMove('local', 1, 0);
    }
});

window.addEventListener('keyup', (e) => {
    if (!window.gameEngine || !window.gameEngine.isRunning) return;
    const p = window.gameEngine.players['local'];
    if (!p) return;

    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        window.gameEngine.handlePlayerJump('local', false);
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        if (p.inputX === -1) window.gameEngine.handlePlayerMove('local', 0, 0);
    }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        if (p.inputX === 1) window.gameEngine.handlePlayerMove('local', 0, 0);
    }
});
