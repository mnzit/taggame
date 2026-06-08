// Game Maps Registry - Easily extendible by adding new objects
const GAME_MAPS = {
    '5_floors': {
        name: '5 Floors',
        build: (w, h) => {
            const platforms = [];
            const decorations = [];
            
            // Ground floor
            platforms.push({ x: 0, y: h - 40, width: w, height: 40, color: '#1e293b' });
            
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
                    platforms.push({ x: px, y: y, width: pw, height: 20, color: '#334155' });
                    
                    // Add random decorations on top of the platform
                    if (Math.random() > 0.2) {
                        const type = Math.random() > 0.6 ? 'tree' : (Math.random() > 0.4 ? 'bush' : 'house');
                        const dw = type === 'house' ? 50 : (type === 'tree' ? 30 : 25);
                        const dh = type === 'house' ? 40 : (type === 'tree' ? 50 : 15);
                        if (pw > dw + 10) {
                            const dx = px + 5 + Math.random() * (pw - dw - 10);
                            decorations.push({ x: dx, y: y - dh, width: dw, height: dh, type: type });
                        }
                    }
                }
            }
            
            // Ground decorations
            for(let i=0; i<6; i++) {
                const type = Math.random() > 0.5 ? 'tree' : (Math.random() > 0.5 ? 'bush' : 'house');
                const dw = type === 'house' ? 60 : (type === 'tree' ? 40 : 30);
                const dh = type === 'house' ? 50 : (type === 'tree' ? 60 : 20);
                const dx = Math.random() * (w - dw);
                decorations.push({ x: dx, y: h - 40 - dh, width: dw, height: dh, type: type });
            }
            
            return { platforms, decorations };
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


const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.players = {};
        this.platforms = [];
        this.decorations = [];
        this.currentMapId = '5_floors';
        this.lastTime = 0;
        this.isRunning = false;
        

        // Scaling for device
        this.scale = isTouchDevice ? 0.7 : 1.3;
        
        // Physics constants
        this.gravity = 2400; // Snappier fall
        this.moveSpeed = isTouchDevice ? 300 : 500; 
        this.jumpForce = isTouchDevice ? -600 : -1500; 
        this.maxFallSpeed = 2000;
        
        // Tag Logic
        this.itPlayerId = null;
        this.tagCooldown = 0; // ms
        
        // Effects
        this.particles = [];
        this.shakeDuration = 0;
        this.anxietyLevel = 0;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Re-generate platforms to fit screen whenever resized or rotated
        this.loadMap();
    }

    setMap(mapId) {
        if (GAME_MAPS[mapId]) {
            this.currentMapId = mapId;
            if (!this.isRunning) this.loadMap();
        }
    }

    addPlayer(id, name) {
        const colors = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24', '#a855f7'];
        const armColors = ['#0284c7', '#65a30d', '#db2777', '#d97706', '#7e22ce'];
        const colorIndex = typeof id === 'number' ? (id - 1) % colors.length : Object.keys(this.players).length % colors.length;
        
        this.players[id] = {
            id: id,
            name: name,
            x: Math.random() * (this.canvas.width - 100) + 50,
            y: 50,
            width: 40 * this.scale,
            height: 40 * this.scale,
            vx: 0,
            vy: 0,
            color: colors[colorIndex],
            armColor: armColors[colorIndex],
            inputX: 0,
            isJumping: false,
            grounded: false,
            stunTimer: 0,
            facingRight: true,
            walkCycle: 0
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

    handlePlayerJump(id, jump) {
        const p = this.players[id];
        if (p) {
            p.isJumping = jump;
            if (jump && p.grounded) {
                p.vy = this.jumpForce;
                p.grounded = false;
                if (window.soundEngine) window.soundEngine.playJump();
            }
        }
    }

    loadMap() {
        const mapData = GAME_MAPS[this.currentMapId].build(this.canvas.width, this.canvas.height);
        this.platforms = mapData.platforms || mapData;
        this.decorations = mapData.decorations || [];
        
        // Prevent players from falling off if screen shrinks
        Object.values(this.players).forEach(p => {
            if (p.x + p.width > this.canvas.width) p.x = this.canvas.width - p.width;
            if (p.y + p.height > this.canvas.height) p.y = 50;
        });
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
                if (p.inputX > 0) p.facingRight = true;
                if (p.inputX < 0) p.facingRight = false;
            }
            
            // Animation walk cycle
            if (Math.abs(p.vx) > 0 && p.grounded) {
                p.walkCycle += dt * 15;
            } else {
                p.walkCycle = 0;
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

        // Check closest distance to IT for anxiety and scared animation
        let minItDist = Infinity;
        if (this.itPlayerId && this.players[this.itPlayerId]) {
            const itP = this.players[this.itPlayerId];
            Object.values(this.players).forEach(p => {
                if (p.id !== this.itPlayerId) {
                    let dx = (p.x + p.width/2) - (itP.x + itP.width/2);
                    let dy = (p.y + p.height/2) - (itP.y + itP.height/2);
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < minItDist) minItDist = dist;
                    p.isScared = dist < 200 * this.scale; // Scared if IT is close
                } else {
                    p.isScared = false;
                }
            });
        }
        
        // Update global anxiety level based on min distance to IT
        const anxietyThreshold = 350 * this.scale;
        if (minItDist < anxietyThreshold && this.tagCooldown <= 0) {
            this.anxietyLevel = 1 - (minItDist / anxietyThreshold);
            if (window.soundEngine) window.soundEngine.playHeartbeat(this.anxietyLevel);
        } else {
            this.anxietyLevel = 0;
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        
        // Update screen shake
        if (this.shakeDuration > 0) {
            this.shakeDuration -= dt;
            if (this.shakeDuration < 0) this.shakeDuration = 0;
        }
    }

    checkTagging() {
        if (this.tagCooldown > 0) return;
        
        const itPlayer = this.players[this.itPlayerId];
        if (!itPlayer) return;
        
        let taggedSomeone = false;
        Object.values(this.players).forEach(p1 => {
            if (taggedSomeone) return;
            Object.values(this.players).forEach(p2 => {
                if (taggedSomeone || p1.id === p2.id) return;
                if (this.checkCollision(p1, p2)) {
                    if (p1.id === this.itPlayerId || p2.id === this.itPlayerId) {
                        // Tag!
                        if (window.soundEngine) window.soundEngine.playTag();
                        this.shakeDuration = 0.15; // Screen shake for a split second (150ms)
                        
                        const tagged = p1.id === this.itPlayerId ? p2 : p1;
                        
                        // Spawn explosion particles
                        const cx = tagged.x + tagged.width/2;
                        const cy = tagged.y + tagged.height/2;
                        for (let i=0; i<30; i++) {
                            this.particles.push({
                                x: cx,
                                y: cy,
                                vx: (Math.random() - 0.5) * 800 * this.scale,
                                vy: (Math.random() - 0.5) * 800 * this.scale,
                                life: 0.3 + Math.random() * 0.4,
                                color: tagged.color
                            });
                        }
                        
                        this.itPlayerId = tagged.id;
                        this.tagCooldown = 2000; // 2 seconds before next tag possible
                        
                        // Freeze the new IT player for 1.5 seconds so the old IT can run
                        tagged.stunTimer = 1500;
                        
                        // Add a tiny bounce effect to separate them
                        itPlayer.vy = -300;
                        tagged.vy = -200;
                        
                        taggedSomeone = true;
                    }
                }
            });
        });
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0f172a'; // slate-900 background
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply screen shake
        this.ctx.save();
        if (this.shakeDuration > 0) {
            const magnitude = (this.shakeDuration / 0.15) * 15 * this.scale;
            this.ctx.translate((Math.random()-0.5)*magnitude, (Math.random()-0.5)*magnitude);
        }
        
        // Draw sky gradient
        const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        grad.addColorStop(0, '#020617'); // Dark night sky
        grad.addColorStop(1, '#1e1b4b'); // Deep purple-blue horizon
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw distant mountains (parallax background effect)
        this.ctx.fillStyle = '#0f172a';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height - 40);
        this.ctx.lineTo(this.canvas.width * 0.15, this.canvas.height - 300);
        this.ctx.lineTo(this.canvas.width * 0.4, this.canvas.height - 150);
        this.ctx.lineTo(this.canvas.width * 0.7, this.canvas.height - 350);
        this.ctx.lineTo(this.canvas.width, this.canvas.height - 100);
        this.ctx.lineTo(this.canvas.width, this.canvas.height);
        this.ctx.fill();

        // Draw decorations
        if (this.decorations) {
            this.decorations.forEach(d => {
                if (d.type === 'tree') {
                    // trunk
                    this.ctx.fillStyle = '#451a03'; // dark brown
                    this.ctx.fillRect(d.x + d.width/2 - 4, d.y + d.height - 20, 8, 20);
                    // leaves
                    this.ctx.fillStyle = '#064e3b'; // dark green
                    this.ctx.beginPath();
                    this.ctx.arc(d.x + d.width/2, d.y + d.height - 30, d.width/2, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#0f766e'; // teal highlight
                    this.ctx.beginPath();
                    this.ctx.arc(d.x + d.width/2 - 5, d.y + d.height - 35, d.width/3, 0, Math.PI * 2);
                    this.ctx.fill();
                } else if (d.type === 'bush') {
                    this.ctx.fillStyle = '#065f46'; // forest green
                    this.ctx.beginPath();
                    this.ctx.arc(d.x + d.width/2, d.y + d.height/2, d.height/2 + 2, 0, Math.PI * 2);
                    this.ctx.arc(d.x + 8, d.y + d.height - 5, d.height/2, 0, Math.PI * 2);
                    this.ctx.arc(d.x + d.width - 8, d.y + d.height - 5, d.height/2, 0, Math.PI * 2);
                    this.ctx.fill();
                } else if (d.type === 'house') {
                    // base
                    this.ctx.fillStyle = '#94a3b8'; // slate
                    this.ctx.fillRect(d.x, d.y + 15, d.width, d.height - 15);
                    // roof
                    this.ctx.fillStyle = '#7f1d1d'; // dark red
                    this.ctx.beginPath();
                    this.ctx.moveTo(d.x - 4, d.y + 15);
                    this.ctx.lineTo(d.x + d.width/2, d.y);
                    this.ctx.lineTo(d.x + d.width + 4, d.y + 15);
                    this.ctx.fill();
                    // door
                    this.ctx.fillStyle = '#451a03';
                    this.ctx.fillRect(d.x + d.width/2 - 6, d.y + d.height - 12, 12, 12);
                    // windows
                    this.ctx.fillStyle = '#fef08a'; // yellow light
                    this.ctx.fillRect(d.x + 8, d.y + 22, 8, 8);
                    this.ctx.fillRect(d.x + d.width - 16, d.y + 22, 8, 8);
                }
            });
        }

        // Draw platforms
        this.platforms.forEach(p => {
            // Main platform block
            this.ctx.fillStyle = p.color || '#334155';
            this.ctx.fillRect(p.x, p.y, p.width, p.height);
            
            // Grass top
            this.ctx.fillStyle = '#22c55e'; // vivid green
            this.ctx.fillRect(p.x, p.y, p.width, 4);
        });
        
        // Draw players
        Object.values(this.players).forEach(p => {
            const isIt = p.id === this.itPlayerId;
            this.drawCharacter(p, isIt);
            
            // Draw 'IT' tag text
            if (isIt) {
                this.ctx.fillStyle = '#ef4444';
                this.ctx.font = 'bold 16px "Fredoka"';
                let text = 'IT!';
                if (this.tagCooldown > 0) text = 'COOLDOWN';
                if (p.stunTimer > 0) text = 'FROZEN!';
                this.ctx.fillText(text, p.x + p.width/2 - 10, p.y - 12);
            }
        });

        // Draw Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life / 0.7; // fade out
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 6 * this.scale, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        // Restore context from screen shake
        this.ctx.restore();
    }

    drawCharacter(p, isIt) {
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const time = performance.now();
        
        let shakeX = 0;
        let shakeY = 0;
        if (p.isScared && p.stunTimer <= 0) {
            shakeX = (Math.random() - 0.5) * 4;
            shakeY = (Math.random() - 0.5) * 4;
        }

        this.ctx.save();
        this.ctx.translate(cx + shakeX, cy + shakeY);
        
        // Apply directional flip AND dynamic size scaling
        const flipX = p.facingRight ? 1 : -1;
        this.ctx.scale(flipX * this.scale, this.scale);

        // Bobbing/breathing animation
        let bobY = 0;
        if (p.grounded && p.vx === 0) {
            bobY = Math.sin(time * 0.005) * 2;
        } else if (p.grounded && Math.abs(p.vx) > 0) {
            bobY = Math.abs(Math.sin(p.walkCycle)) * -4;
        }

        // Draw Legs
        this.ctx.fillStyle = '#0f172a'; // dark shoes
        if (p.grounded && Math.abs(p.vx) > 0) {
            // Running legs
            const legSwing = Math.sin(p.walkCycle) * 10;
            this.ctx.beginPath();
            this.ctx.roundRect(-10 + legSwing, p.height/2 - 10, 8, 12, 4);
            this.ctx.roundRect(2 - legSwing, p.height/2 - 10, 8, 12, 4);
            this.ctx.fill();
        } else if (!p.grounded) {
            // Jumping legs
            this.ctx.beginPath();
            if (p.vy < 0) { // Going up
                this.ctx.roundRect(-12, p.height/2 - 5, 8, 10, 4);
                this.ctx.roundRect(4, p.height/2 - 5, 8, 10, 4);
            } else { // Falling
                this.ctx.roundRect(-10, p.height/2 - 12, 8, 14, 4);
                this.ctx.roundRect(2, p.height/2 - 12, 8, 14, 4);
            }
            this.ctx.fill();
        } else {
            // Idle legs
            this.ctx.beginPath();
            this.ctx.roundRect(-10, p.height/2 - 8, 8, 10, 4);
            this.ctx.roundRect(2, p.height/2 - 8, 8, 10, 4);
            this.ctx.fill();
        }

        // Draw Body (Pill shape)
        this.ctx.fillStyle = p.color;
        // Body shadow for "IT" state
        if (isIt) {
            if (this.tagCooldown > 0) {
                this.ctx.fillStyle = (Math.floor(time / 200) % 2 === 0) ? '#ef4444' : '#fca5a5';
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#fca5a5';
            } else {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = '#ef4444';
                this.ctx.fillStyle = '#ef4444';
            }
        } else {
            this.ctx.shadowBlur = 0;
            if (p.stunTimer > 0) this.ctx.globalAlpha = 0.5;
        }

        this.ctx.beginPath();
        const bodyW = 32;
        const bodyH = 36;
        this.ctx.roundRect(-bodyW/2, -bodyH/2 + bobY, bodyW, bodyH, 12);
        this.ctx.fill();
        
        this.ctx.shadowBlur = 0; // reset shadow for face

        // Visor/Face Area
        this.ctx.fillStyle = '#f8fafc'; // white/light blue visor
        this.ctx.beginPath();
        this.ctx.roundRect(2, -8 + bobY, 18, 14, 6);
        this.ctx.fill();

        // Eyes
        this.ctx.fillStyle = '#0f172a'; // black pupils
        if (p.stunTimer > 0) {
            // Dizzy 'X' eyes
            this.ctx.strokeStyle = '#0f172a';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(6, -4 + bobY); this.ctx.lineTo(10, 0 + bobY);
            this.ctx.moveTo(10, -4 + bobY); this.ctx.lineTo(6, 0 + bobY);
            this.ctx.moveTo(14, -4 + bobY); this.ctx.lineTo(18, 0 + bobY);
            this.ctx.moveTo(18, -4 + bobY); this.ctx.lineTo(14, 0 + bobY);
            this.ctx.stroke();
        } else if (isIt && this.tagCooldown <= 0) {
            // Angry eyes
            this.ctx.beginPath();
            this.ctx.arc(8, -1 + bobY, 2, 0, Math.PI*2);
            this.ctx.arc(16, -1 + bobY, 2, 0, Math.PI*2);
            this.ctx.fill();
            // Angry eyebrows
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(4, -6 + bobY); this.ctx.lineTo(10, -3 + bobY);
            this.ctx.moveTo(20, -6 + bobY); this.ctx.lineTo(14, -3 + bobY);
            this.ctx.stroke();
        } else if (p.isScared) {
            // Scared eyes (wide open)
            this.ctx.beginPath();
            this.ctx.arc(8, -2 + bobY, 3, 0, Math.PI*2);
            this.ctx.arc(16, -2 + bobY, 3, 0, Math.PI*2);
            this.ctx.fill();
            // Scared eyebrows (raised)
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(5, -7 + bobY); this.ctx.lineTo(9, -8 + bobY);
            this.ctx.moveTo(19, -7 + bobY); this.ctx.lineTo(15, -8 + bobY);
            this.ctx.stroke();
        } else {
            // Normal eyes
            this.ctx.beginPath();
            this.ctx.arc(8, -1 + bobY, 2, 0, Math.PI*2);
            this.ctx.arc(16, -1 + bobY, 2, 0, Math.PI*2);
            this.ctx.fill();
        }

        // Draw Arms
        this.ctx.fillStyle = p.armColor || '#000000'; // Darker arm color for contrast
        if (isIt) this.ctx.fillStyle = (this.tagCooldown > 0 && Math.floor(time/200)%2 !== 0) ? '#fca5a5' : '#991b1b'; // Darker red for IT arms
        
        this.ctx.beginPath();
        if (!p.grounded && p.vy < 0) {
            // Jumping: hands up
            this.ctx.roundRect(0, -20 + bobY, 8, 14, 4); // back arm
            this.ctx.roundRect(-16, -15 + bobY, 8, 14, 4); // front arm
        } else if (p.isScared && p.stunTimer <= 0) {
            // Scared arms (raised up) and jittering
            const armShakeX = (Math.random() - 0.5) * 3;
            const armShakeY = (Math.random() - 0.5) * 3;
            this.ctx.roundRect(0 + armShakeX, -20 + bobY + armShakeY, 8, 14, 4);
            this.ctx.roundRect(-16 + armShakeX, -15 + bobY + armShakeY, 8, 14, 4);
        } else if (p.grounded && Math.abs(p.vx) > 0) {
            // Running: swing arms
            const armSwing = Math.sin(p.walkCycle) * 8;
            this.ctx.roundRect(-6 - armSwing, 0 + bobY, 8, 12, 4); // back arm
            this.ctx.roundRect(-6 + armSwing, 2 + bobY, 8, 12, 4); // front arm
        } else {
            // Idle arms
            this.ctx.roundRect(-10, 0 + bobY, 8, 12, 4); // back arm
            this.ctx.roundRect(4, 2 + bobY, 8, 12, 4); // front arm
        }
        this.ctx.fill();

        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
    }
}

// Procedural Sound Engine
class SoundEngine {
    constructor() {
        // Initialize audio context lazily on first user interaction if needed
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.lastHeartbeat = 0;
    }
    
    playJump() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime); // keep volume low
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playTag() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Satisfying thud explosion
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        
        gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }

    playHeartbeat(intensity) {
        if (this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        // Pulse faster as intensity approaches 1
        const interval = Math.max(0.2, 1.0 - (intensity * 0.8));
        if (now - this.lastHeartbeat < interval) return; 
        this.lastHeartbeat = now;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.15);
        
        gain.gain.setValueAtTime(1.2 * intensity, now); // Increased volume
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
}

// Global initialization
window.soundEngine = new SoundEngine();
window.gameEngine = new GameEngine();

window.joinLocal = function() {
    if (!window.gameEngine) return;
    
    let added = false;
    if (!window.gameEngine.players['local1']) {
        window.gameEngine.addPlayer('local1', isTouchDevice ? 'P1 (Touch)' : 'P1 (WASD)');
        added = true;
        
        if (isTouchDevice) {
            document.getElementById('local-mobile-controls').classList.remove('hidden');
            window.initLocalJoystick();
        }
    } else if (!isTouchDevice && !window.gameEngine.players['local2']) {
        window.gameEngine.addPlayer('local2', 'P2 (Arrows)');
        added = true;
    }
    
    if (added) {
        const count = (window.gameEngine.players['local1'] ? 1 : 0) + (window.gameEngine.players['local2'] ? 1 : 0);
        const max = isTouchDevice ? 1 : 2;
        const btn = document.getElementById('btn-join-local');
        btn.innerText = `ADD LOCAL PLAYER (${count}/${max})`;
        
        if (count >= max) {
            btn.classList.replace('bg-blue-500', 'bg-slate-600');
            btn.classList.replace('hover:bg-blue-400', 'hover:bg-slate-600');
            btn.disabled = true;
        }
        
        const countEl = document.getElementById('player-count');
        countEl.innerText = parseInt(countEl.innerText) + 1;
        document.getElementById('btn-start').classList.remove('hidden');
    }
};

let localJoy = null;
window.initLocalJoystick = function() {
    if (localJoy) return;
    const zone = document.getElementById('local-joystick-zone');
    
    // Check if nipplejs is loaded
    if (typeof nipplejs === 'undefined') {
        console.error("NippleJS not loaded");
        return;
    }
    
    localJoy = nipplejs.create({
        zone: zone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#ffffff',
        size: 100
    });
    
    localJoy.on('move', (evt, data) => {
        let x = Math.cos(data.angle.radian);
        window.gameEngine.handlePlayerMove('local1', x, 0); // Ignore Y for horizontal platformer
    });
    localJoy.on('end', () => {
        window.gameEngine.handlePlayerMove('local1', 0, 0);
    });
    
    const jumpBtn = document.getElementById('btn-local-jump');
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.gameEngine.handlePlayerJump('local1', true);
    }, {passive: false});
    
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        window.gameEngine.handlePlayerJump('local1', false);
    }, {passive: false});
};

window.startGame = async function() {
    document.getElementById('lobby-modal').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    // Attempt to force horizontal/landscape mode for mobile hosts
    if (isTouchDevice) {
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                await el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) { /* Safari */
                await el.webkitRequestFullscreen();
            } else if (el.msRequestFullscreen) { /* IE11 */
                await el.msRequestFullscreen();
            }
            
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch (err) {
            console.log('Orientation lock failed or not supported:', err);
        }
    }
    
    window.gameEngine.start();
};

// Local Keyboard Controls
window.addEventListener('keydown', (e) => {
    if (!window.gameEngine || !window.gameEngine.isRunning) return;
    
    const p1 = window.gameEngine.players['local1'];
    if (p1) {
        if (e.code === 'Space' || e.code === 'KeyW') window.gameEngine.handlePlayerJump('local1', true);
        if (e.code === 'KeyA') window.gameEngine.handlePlayerMove('local1', -1, 0);
        if (e.code === 'KeyD') window.gameEngine.handlePlayerMove('local1', 1, 0);
    }
    
    const p2 = window.gameEngine.players['local2'];
    if (p2) {
        if (e.code === 'ArrowUp') window.gameEngine.handlePlayerJump('local2', true);
        if (e.code === 'ArrowLeft') window.gameEngine.handlePlayerMove('local2', -1, 0);
        if (e.code === 'ArrowRight') window.gameEngine.handlePlayerMove('local2', 1, 0);
    }
});

window.addEventListener('keyup', (e) => {
    if (!window.gameEngine || !window.gameEngine.isRunning) return;
    
    const p1 = window.gameEngine.players['local1'];
    if (p1) {
        if (e.code === 'Space' || e.code === 'KeyW') window.gameEngine.handlePlayerJump('local1', false);
        if (e.code === 'KeyA' && p1.inputX === -1) window.gameEngine.handlePlayerMove('local1', 0, 0);
        if (e.code === 'KeyD' && p1.inputX === 1) window.gameEngine.handlePlayerMove('local1', 0, 0);
    }
    
    const p2 = window.gameEngine.players['local2'];
    if (p2) {
        if (e.code === 'ArrowUp') window.gameEngine.handlePlayerJump('local2', false);
        if (e.code === 'ArrowLeft' && p2.inputX === -1) window.gameEngine.handlePlayerMove('local2', 0, 0);
        if (e.code === 'ArrowRight' && p2.inputX === 1) window.gameEngine.handlePlayerMove('local2', 0, 0);
    }
});
