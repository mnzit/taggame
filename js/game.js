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
        this.footprints = [];
        this.shakeDuration = 0;
        this.anxietyLevel = 0;
        
        // Weather
        this.currentWeather = 'none'; // 'none', 'wind_left', 'wind_right', 'fog'
        this.weatherTimer = 10.0;
        this.weatherDuration = 0;
        this.weatherParticles = [];
        
        // Day/Night Cycle
        this.timeOfDay = 0.5 * Math.PI; // Starts at twilight (sunset)
        
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
            sprintTimer: 0,
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
        
        // Add collapsible platform logic
        this.platforms.forEach((plat, index) => {
            if (index > 0 && Math.random() < 0.4) {
                plat.isCollapsible = true;
                plat.state = 'normal';
                plat.crumbleTimer = 0;
            } else {
                plat.isCollapsible = false;
            }
        });
        
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
        // Update Time of Day
        this.timeOfDay += dt * 0.05; // 1 cycle roughly every 125 seconds

        // Weather cycle
        if (this.weatherDuration > 0) {
            this.weatherDuration -= dt;
            if (this.weatherDuration <= 0) {
                this.currentWeather = 'none';
                this.weatherTimer = 10 + Math.random() * 15;
            }
        } else {
            this.weatherTimer -= dt;
            if (this.weatherTimer <= 0) {
                const events = ['wind_left', 'wind_right', 'fog'];
                this.currentWeather = events[Math.floor(Math.random() * events.length)];
                this.weatherDuration = 6 + Math.random() * 6; // 6 to 12 seconds
            }
        }

        // Platform Crumbling Update
        this.platforms.forEach(plat => {
            if (plat.isCollapsible) {
                if (plat.state === 'flashing') {
                    plat.crumbleTimer -= dt;
                    if (plat.crumbleTimer <= 0) {
                        plat.state = 'crumbled';
                        plat.crumbleTimer = 4.0; // regenerate after 4s
                    }
                } else if (plat.state === 'crumbled') {
                    plat.crumbleTimer -= dt;
                    if (plat.crumbleTimer <= 0) {
                        plat.state = 'normal';
                    }
                }
            }
        });

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
                
                // Footprints system
                if (Math.abs(p.vx) > this.moveSpeed * 0.6) {
                    p.sprintTimer += dt;
                    if (p.sprintTimer > 0.5 && p.grounded && p.id !== this.itPlayerId) {
                        if (!p.lastFootprintTime || Date.now() - p.lastFootprintTime > 150) {
                            p.lastFootprintTime = Date.now();
                            this.footprints.push({
                                x: p.x + p.width / 2,
                                y: p.y + p.height,
                                facingRight: p.facingRight,
                                life: 3.0
                            });
                        }
                    }
                } else {
                    p.sprintTimer -= dt * 2;
                    if (p.sprintTimer < 0) p.sprintTimer = 0;
                }
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
            
            // Apply Weather (Wind)
            if (!p.grounded && p.stunTimer <= 0) {
                if (this.currentWeather === 'wind_left') p.vx -= 600 * dt;
                if (this.currentWeather === 'wind_right') p.vx += 600 * dt;
            }
            
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
                if (plat.isCollapsible && plat.state === 'crumbled') return; // Ignore crumbled
                
                // Check horizontal overlap first
                if (p.x + p.width > plat.x && p.x < plat.x + plat.width) {
                    
                    // Colliding from above (landing on platform)
                    if (p.vy >= 0 && 
                        p.y + p.height > plat.y && 
                        p.y + p.height - (p.vy * dt) <= plat.y + 15) {
                        
                        p.y = plat.y - p.height;
                        p.vy = 0;
                        p.grounded = true;
                        
                        if (plat.isCollapsible && plat.state === 'normal') {
                            plat.state = 'flashing';
                            plat.crumbleTimer = 2.0;
                        }
                    }
                    // Colliding from below (bonking head)
                    else if (p.vy < 0 && 
                             p.y < plat.y + plat.height && 
                             p.y - (p.vy * dt) >= plat.y + plat.height - 15) {
                             
                        p.y = plat.y + plat.height;
                        p.vy = 0; // stop upward momentum
                    }
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
        
        // Update footprints
        for (let i = this.footprints.length - 1; i >= 0; i--) {
            let fp = this.footprints[i];
            fp.life -= dt;
            if (fp.life <= 0) this.footprints.splice(i, 1);
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
        
        // Day/Night Cycle factors
        const timeFactor = -Math.cos(this.timeOfDay); // -1 (noon) to 1 (midnight)
        
        // Push the onset of darkness so it only happens when the sun is further down
        // timeFactor > 0.2 means the sun is below the horizon
        const darknessLevel = Math.max(0, (timeFactor - 0.2) / 0.8); // 0 to 1
        const dayLevel = Math.max(0, (-timeFactor - 0.2) / 0.8); // 0 to 1
        
        // Background colors interpolated based on cycle
        const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        if (dayLevel > 0) {
            skyGrad.addColorStop(0, `rgba(56, 189, 248, ${dayLevel})`); // sky-400
            skyGrad.addColorStop(1, `rgba(125, 211, 252, ${dayLevel})`); // sky-300
        } else {
            skyGrad.addColorStop(0, `rgba(2, 6, 23, ${darknessLevel})`); // slate-950
            skyGrad.addColorStop(1, `rgba(30, 41, 59, ${darknessLevel})`); // slate-800
        }
        this.ctx.fillStyle = skyGrad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw Sun and Moon
        const sunAngle = this.timeOfDay + 1.5 * Math.PI;
        const moonAngle = this.timeOfDay + 0.5 * Math.PI;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height - 40;
        const celestialRadius = Math.min(this.canvas.width, this.canvas.height) * 0.45;
        
        const sunX = cx + Math.cos(sunAngle) * celestialRadius;
        const sunY = cy + Math.sin(sunAngle) * celestialRadius;
        const moonX = cx + Math.cos(moonAngle) * celestialRadius;
        const moonY = cy + Math.sin(moonAngle) * celestialRadius;
        
        if (sunY < this.canvas.height + 100) {
            const sunGlow = this.ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150);
            sunGlow.addColorStop(0, 'rgba(253, 224, 71, 0.4)');
            sunGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
            this.ctx.fillStyle = sunGlow;
            this.ctx.beginPath(); this.ctx.arc(sunX, sunY, 150, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.beginPath(); this.ctx.arc(sunX, sunY, 40, 0, Math.PI*2); this.ctx.fill();
        }
        
        if (moonY < this.canvas.height + 100) {
            const moonGlow = this.ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 100);
            moonGlow.addColorStop(0, 'rgba(226, 232, 240, 0.3)');
            moonGlow.addColorStop(1, 'rgba(226, 232, 240, 0)');
            this.ctx.fillStyle = moonGlow;
            this.ctx.beginPath(); this.ctx.arc(moonX, moonY, 100, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = '#f8fafc';
            this.ctx.beginPath(); this.ctx.arc(moonX, moonY, 30, 0, Math.PI*2); this.ctx.fill();
        }
        
        // Background mountains
        this.ctx.fillStyle = '#1e293b';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height - 40);
        this.ctx.lineTo(this.canvas.width * 0.15, this.canvas.height - 300);
        this.ctx.lineTo(this.canvas.width * 0.4, this.canvas.height - 150);
        this.ctx.lineTo(this.canvas.width * 0.7, this.canvas.height - 350);
        this.ctx.lineTo(this.canvas.width, this.canvas.height - 40);
        this.ctx.fill();

        // Draw Footprints
        this.footprints.forEach(fp => {
            this.ctx.globalAlpha = fp.life / 3.0;
            this.ctx.fillStyle = '#4ade80'; // glowing green
            this.ctx.shadowColor = '#4ade80';
            this.ctx.shadowBlur = 10;
            this.ctx.beginPath();
            this.ctx.ellipse(fp.x, fp.y, 6 * this.scale, 3 * this.scale, fp.facingRight ? 0.2 : -0.2, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;
        this.ctx.shadowBlur = 0;

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

        // Draw Platforms
        this.platforms.forEach(plat => {
            if (plat.isCollapsible && plat.state === 'crumbled') return;
            
            this.ctx.fillStyle = plat.color || '#334155';
            
            if (plat.isCollapsible && plat.state === 'flashing') {
                const flashSpeed = Math.max(0.1, plat.crumbleTimer / 4);
                if (Math.floor(plat.crumbleTimer / flashSpeed * 10) % 2 === 0) {
                    this.ctx.fillStyle = '#ef4444'; // Flashing Red
                }
            }
            
            this.ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
            
            // Grass top
            this.ctx.fillStyle = '#22c55e'; // vivid green
            this.ctx.fillRect(plat.x, plat.y, plat.width, 4);
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

        // Weather Effects rendering
        if (this.currentWeather === 'wind_left' || this.currentWeather === 'wind_right') {
            const dir = this.currentWeather === 'wind_left' ? -1 : 1;
            if (Math.random() < 0.3) {
                this.weatherParticles.push({
                    x: dir === 1 ? -100 : this.canvas.width + 100,
                    y: Math.random() * this.canvas.height,
                    vx: dir * (1000 + Math.random() * 1000),
                    width: 50 + Math.random() * 150
                });
            }
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for(let i=this.weatherParticles.length-1; i>=0; i--) {
                let wp = this.weatherParticles[i];
                wp.x += wp.vx * 0.016;
                this.ctx.fillRect(wp.x, wp.y, wp.width, 2);
                if ((dir === 1 && wp.x > this.canvas.width + 200) || (dir === -1 && wp.x < -200)) {
                    this.weatherParticles.splice(i, 1);
                }
            }
        }
        
        if (this.currentWeather === 'fog') {
            if (!this.fogCanvas) {
                this.fogCanvas = document.createElement('canvas');
                this.fogCtx = this.fogCanvas.getContext('2d');
            }
            if (this.fogCanvas.width !== this.canvas.width || this.fogCanvas.height !== this.canvas.height) {
                this.fogCanvas.width = this.canvas.width;
                this.fogCanvas.height = this.canvas.height;
            }
            
            this.fogCtx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            this.fogCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.fogCtx.globalCompositeOperation = 'destination-out';
            Object.values(this.players).forEach(p => {
                if (p.id !== this.itPlayerId) {
                    const gradient = this.fogCtx.createRadialGradient(
                        p.x + p.width/2, p.y + p.height/2, 10,
                        p.x + p.width/2, p.y + p.height/2, 250 * this.scale
                    );
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    this.fogCtx.fillStyle = gradient;
                    this.fogCtx.beginPath();
                    this.fogCtx.arc(p.x + p.width/2, p.y + p.height/2, 250 * this.scale, 0, Math.PI*2);
                    this.fogCtx.fill();
                }
            });
            this.fogCtx.globalCompositeOperation = 'source-over';
            
            this.ctx.drawImage(this.fogCanvas, 0, 0);
        }

        // Draw Darkness / Vision Control Overlay
        if (darknessLevel > 0) {
            if (!this.darkCanvas) {
                this.darkCanvas = document.createElement('canvas');
                this.darkCtx = this.darkCanvas.getContext('2d');
            }
            if (this.darkCanvas.width !== this.canvas.width || this.darkCanvas.height !== this.canvas.height) {
                this.darkCanvas.width = this.canvas.width;
                this.darkCanvas.height = this.canvas.height;
            }
            
            this.darkCtx.globalCompositeOperation = 'source-over';
            this.darkCtx.fillStyle = `rgba(0, 0, 0, ${0.98 * darknessLevel})`;
            this.darkCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.darkCtx.globalCompositeOperation = 'destination-out';
            Object.values(this.players).forEach(p => {
                let baseRadius = (p.id === this.itPlayerId) ? 350 * this.scale : 120 * this.scale;
                let intensity = (p.id === this.itPlayerId) ? 1.0 : 0.8;
                
                // Expand vision drastically as darkness lifts
                let radius = baseRadius + (this.canvas.width * 1.5 * Math.pow(1 - darknessLevel, 3));
                
                const gradient = this.darkCtx.createRadialGradient(
                    p.x + p.width/2, p.y + p.height/2, 10,
                    p.x + p.width/2, p.y + p.height/2, radius
                );
                gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                this.darkCtx.fillStyle = gradient;
                this.darkCtx.beginPath();
                this.darkCtx.arc(p.x + p.width/2, p.y + p.height/2, radius, 0, Math.PI*2);
                this.darkCtx.fill();
            });
            this.darkCtx.globalCompositeOperation = 'source-over';
            
            this.ctx.drawImage(this.darkCanvas, 0, 0);
            
            // Draw IT Lantern Glow Overlay
            const itP = this.players[this.itPlayerId];
            if (itP && itP.stunTimer <= 0) {
                let lanternRadius = 350 * this.scale + (this.canvas.width * Math.pow(1 - darknessLevel, 2));
                const lanternGlow = this.ctx.createRadialGradient(
                    itP.x + itP.width/2, itP.y + itP.height/2, 10,
                    itP.x + itP.width/2, itP.y + itP.height/2, lanternRadius
                );
                const pulse = Math.sin(Date.now() / 150) * 0.1 + 0.9;
                lanternGlow.addColorStop(0, `rgba(220, 38, 38, ${0.4 * darknessLevel * pulse})`);
                lanternGlow.addColorStop(1, 'rgba(220, 38, 38, 0)');
                
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.fillStyle = lanternGlow;
                this.ctx.beginPath();
                this.ctx.arc(itP.x + itP.width/2, itP.y + itP.height/2, lanternRadius, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.globalCompositeOperation = 'source-over';
            }
        }
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
        let distance = Math.min(100, data.distance); // nipplejs size is 100
        let magnitude = distance / 50; // max is ~2.0, cap at 1
        if (magnitude > 1) magnitude = 1;
        let x = Math.cos(data.angle.radian) * magnitude;
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
window.keys = {};

window.addEventListener('keydown', (e) => {
    window.keys[e.code] = true;
    updateLocalInputs();
});

window.addEventListener('keyup', (e) => {
    window.keys[e.code] = false;
    updateLocalInputs();
});

function updateLocalInputs() {
    if (!window.gameEngine || !window.gameEngine.isRunning) return;
    
    const p1 = window.gameEngine.players['local1'];
    if (p1 && !isTouchDevice) {
        let x = 0;
        if (window.keys['KeyA']) x -= 1;
        if (window.keys['KeyD']) x += 1;
        if (window.keys['ShiftLeft'] || window.keys['ShiftRight']) x *= 0.5; // Sneak
        window.gameEngine.handlePlayerMove('local1', x, 0);
        window.gameEngine.handlePlayerJump('local1', window.keys['Space'] || window.keys['KeyW']);
    }
    
    const p2 = window.gameEngine.players['local2'];
    if (p2) {
        let x = 0;
        if (window.keys['ArrowLeft']) x -= 1;
        if (window.keys['ArrowRight']) x += 1;
        if (window.keys['ShiftRight'] || window.keys['ShiftLeft']) x *= 0.5; // Sneak
        window.gameEngine.handlePlayerMove('local2', x, 0);
        window.gameEngine.handlePlayerJump('local2', window.keys['ArrowUp']);
    }
}
