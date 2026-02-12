const socket = io();

const container = document.querySelector('.cyber-container');
const nodesLayer = document.getElementById('nodes-layer');
const coreHub = document.getElementById('core-hub');
const canvas = document.getElementById('lily-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let flower;
const pageNodes = new Map(); // pageId -> { el, pistil, color }
const processingPages = new Set(); 

const CONFIG = {
    stamenCountPerHead: 25, 
    petalCountPerHead: 6,
    stamenColor: 'rgba(255, 60, 60, 0.85)', 
    petalColor: 'rgba(180, 20, 30, 0.95)', 
    antherColor: 'rgba(255, 200, 200, 0.95)', 
    stemColor: 'rgba(100, 20, 20, 0.8)',
    orbColor: 'rgba(200, 230, 255, 1)',
    orbGlow: 'rgba(100, 180, 255, 0.4)' 
};

// --- Utils ---

function lerpColor(a, b, amount) {
    const ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (Math.round(rr) << 16) + (Math.round(rg) << 8) + Math.round(rb)).toString(16).slice(1);
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function getBezierPoint(t, p0, p1, p2, p3) {
    const oneMinusT = 1 - t;
    const tSq = t * t;
    const tCu = t * t * t;
    const oneMinusTSq = oneMinusT * oneMinusT;
    const oneMinusTCu = oneMinusTSq * oneMinusT;

    const x = oneMinusTCu * p0.x + 3 * oneMinusTSq * t * p1.x + 3 * oneMinusT * tSq * p2.x + tCu * p3.x;
    const y = oneMinusTCu * p0.y + 3 * oneMinusTSq * t * p1.y + 3 * oneMinusT * tSq * p2.y + tCu * p3.y;
    return { x, y };
}

function getQuadBezierPoint(t, p0, p1, p2) {
    const oneMinusT = 1 - t;
    const x = oneMinusT*oneMinusT * p0.x + 2*oneMinusT*t * p1.x + t*t * p2.x;
    const y = oneMinusT*oneMinusT * p0.y + 2*oneMinusT*t * p1.y + t*t * p2.y;
    return { x, y };
}

// --- Classes ---

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.005 + Math.random() * 0.015; 
        this.vx = (Math.random() - 0.5) * 1.5; 
        this.vy = -0.5 - Math.random() * 1.5; 
        this.size = 0.5 + Math.random() * 2.5; 
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95; 
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        
        ctx.shadowBlur = this.size * 2;
        ctx.shadowColor = this.color;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

class Petal {
    constructor(relativeAngle) {
        this.relativeAngle = relativeAngle;
        this.growthDuration = 1000 + Math.random() * 500;
        
        this.maxLen = 0.75 + Math.random() * 0.15; 
        this.maxWidth = 12 + Math.random() * 6; 
        
        this.waveFreq = 12 + Math.random() * 5; 
        this.waveAmp = 1.5 + Math.random() * 1; 
        this.wavePhaseOffset = Math.random() * 100; 
        
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.0008; 
    }

    draw(headX, headY, headRotation, baseScale, timeSinceStart) {
        const progress = Math.min(1, timeSinceStart / this.growthDuration);
        const eased = easeOutCubic(progress);
        if (progress <= 0) return;

        const sway = Math.sin(timeSinceStart * this.swaySpeed + this.swayPhase) * 0.04 * eased;
        const angle = headRotation + this.relativeAngle + sway;

        const len = baseScale * this.maxLen * eased;
        
        const tipX = headX + Math.cos(angle) * len;
        const tipY = headY + Math.sin(angle) * len; 

        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);

        const archHeight = len * 0.35; 
        const cp1X = headX + Math.cos(angle) * (len * 0.3) + nx * archHeight;
        const cp1Y = headY + Math.sin(angle) * (len * 0.3) + ny * archHeight;
        
        const curlDepth = len * 0.35;
        const cp2X = headX + Math.cos(angle) * (len * 0.75) - nx * curlDepth;
        const cp2Y = headY + Math.sin(angle) * (len * 0.75) - ny * curlDepth;

        const p0 = {x: headX, y: headY};
        const p1 = {x: cp1X, y: cp1Y};
        const p2 = {x: cp2X, y: cp2Y};
        const p3 = {x: tipX, y: tipY};

        const pointsLeft = [];
        const pointsRight = [];
        const steps = 30;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pos = getBezierPoint(t, p0, p1, p2, p3);
            const nextPos = getBezierPoint(Math.min(1, t + 0.01), p0, p1, p2, p3);
            
            const dx = nextPos.x - pos.x;
            const dy = nextPos.y - pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist === 0) continue;
            
            const nx = -dy / dist;
            const ny = dx / dist;

            let widthAtT = Math.sin(Math.pow(t, 0.8) * Math.PI) * this.maxWidth * eased;
            const wave = Math.sin(t * this.waveFreq + this.wavePhaseOffset) * this.waveAmp * eased;
            widthAtT += wave;

            if (t > 0.9) widthAtT *= (1 - t) * 10; 

            pointsLeft.push({ x: pos.x + nx * widthAtT, y: pos.y + ny * widthAtT });
            pointsRight.push({ x: pos.x - nx * widthAtT, y: pos.y - ny * widthAtT });
        }

        ctx.beginPath();
        ctx.moveTo(pointsLeft[0].x, pointsLeft[0].y);
        for (let i = 1; i < pointsLeft.length; i++) ctx.lineTo(pointsLeft[i].x, pointsLeft[i].y);
        ctx.lineTo(pointsRight[pointsRight.length - 1].x, pointsRight[pointsRight.length - 1].y);
        for (let i = pointsRight.length - 2; i >= 0; i--) ctx.lineTo(pointsRight[i].x, pointsRight[i].y);
        ctx.closePath();

        const grad = ctx.createLinearGradient(headX, headY, tipX, tipY);
        grad.addColorStop(0, '#500000');
        grad.addColorStop(0.4, CONFIG.petalColor);
        grad.addColorStop(1, '#ff4444');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

class Pistil {
    constructor(relativeAngle, index) {
        this.relativeAngle = relativeAngle;
        this.index = index;
        this.isGone = false; 
        this.isTargeted = false; 
        this.respawnTime = 0; 
        
        this.startDelay = index * 35; 
        this.growthDuration = 1200 + Math.random() * 600;
        this.lengthVariance = 0.8 + Math.random() * 0.3; 
        
        this.swaySpeed = 0.0005 + Math.random() * 0.001; 
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swayRange = 0.08 + Math.random() * 0.04; 
        
        this.claimedBy = null; // pageId
        this.color = null;
    }

    getGeometry(headX, headY, headRotation, baseScale, timeSinceStart) {
        const life = timeSinceStart - this.startDelay;
        if (life < 0) return null;

        let progress = Math.min(1, life / this.growthDuration);
        const eased = easeOutCubic(progress);

        const sway = Math.sin(timeSinceStart * this.swaySpeed + this.swayPhase) * this.swayRange * eased;
        
        const currentAngle = headRotation + this.relativeAngle + sway;
        const currentLen = baseScale * 1.5 * this.lengthVariance * eased;
        
        const tipX = headX + (Math.cos(currentAngle) * currentLen);
        const tipY = headY + (Math.sin(currentAngle) * currentLen * 0.9); 

        const cp1X = headX + (tipX - headX) * 0.5;
        const cp1Y = headY + (tipY - headY) * 0.1; 
        const curlSharpness = currentLen * 0.4;
        const cp2X = tipX; 
        const cp2Y = tipY + curlSharpness; 

        return {
            p0: { x: headX, y: headY },
            p1: { x: cp1X, y: cp1Y },
            p2: { x: cp2X, y: cp2Y },
            p3: { x: tipX, y: tipY },
            progress: progress,
            eased: eased
        };
    }

    draw(headX, headY, headRotation, baseScale, timeSinceStart) {
        if (this.isGone) return;

        const geom = this.getGeometry(headX, headY, headRotation, baseScale, timeSinceStart);
        if (!geom) return;

        ctx.beginPath();
        ctx.moveTo(geom.p0.x, geom.p0.y);
        ctx.bezierCurveTo(geom.p1.x, geom.p1.y, geom.p2.x, geom.p2.y, geom.p3.x, geom.p3.y);
        
        const color = this.color || CONFIG.stamenColor;
        const grad = ctx.createLinearGradient(geom.p0.x, geom.p0.y, geom.p3.x, geom.p3.y);
        grad.addColorStop(0, '#600000');
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, this.color ? '#ffffff' : '#ffaaaa');
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = this.color ? 2.5 : 1.8; 
        ctx.lineCap = 'round';
        ctx.stroke();

        if (geom.progress > 0.1) {
            const circleSize = (this.color ? 4 : 2.5) * geom.eased;
            ctx.beginPath();
            ctx.arc(geom.p3.x, geom.p3.y, circleSize, 0, Math.PI * 2);
            
            const glowColor = this.color || CONFIG.antherColor;
            ctx.shadowBlur = (this.color ? 15 : 5) * geom.eased;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = glowColor;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

class SpiritOrb {
    constructor(flower, targetHead, targetPistil, requestId, color, profilePic, isDryRun = false) {
        this.flower = flower;
        this.targetHead = targetHead;
        this.targetPistil = targetPistil;
        this.requestId = requestId;
        this.color = color || CONFIG.orbColor;
        this.profilePic = profilePic;
        this.isDryRun = isDryRun;
        this.isProcessing = false;
        
        this.state = isDryRun ? 'FLOAT' : 'WAITING'; 
        this.x = isDryRun ? (Math.random() * width) : 0;
        this.y = isDryRun ? height + 20 : 0;
        this.radius = isDryRun ? 15 : 5; // Dry run orbs are larger and blurrier
        this.timer = 0;
        this.finished = false; 
        
        this.pulseOffset = Math.random() * 10000;
        this.pulseSpeed = isDryRun ? 0.001 : (0.003 + Math.random() * 0.008);

        this.waitDuration = 200; 
        this.stemDuration = 1000;
        this.coreDuration = 500; // Time to dwell at core visually if processing is fast
        this.pedicelDuration = 600; 
        this.pistilDuration = 1500;
        this.floatPhase = Math.random() * Math.PI * 2;

        if (profilePic) {
            this.img = new Image();
            this.img.src = profilePic;
        }
    }

    update(stemBaseX, stemBaseY, stemTipY, baseScale, timeSinceStart) {
        if (this.isDryRun) {
            this.timer += 16;
            this.y -= 0.5; // Slower float for dry run
            this.x += Math.sin(this.timer * 0.001 + this.floatPhase) * 0.2;
            if (this.y < -100) this.finished = true;
            return;
        }

        const hubEl = document.getElementById('hub-wrapper');
        const hubRect = hubEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const hubY = (hubRect.top - containerRect.top) + (hubRect.height / 2);

        if (this.state === 'WAITING') {
            this.timer += 16;
            this.x = stemBaseX;
            this.y = stemBaseY;
            
            if (this.timer > this.waitDuration) {
                this.state = 'STEM';
                this.timer = 0;
            }
        }
        else if (this.state === 'STEM') {
            this.timer += 16;
            const t = Math.min(1, this.timer / this.stemDuration);
            this.x = stemBaseX;
            const stemHeightToHub = stemBaseY - hubY;
            this.y = stemBaseY - (stemHeightToHub * t);
            
            if (t >= 1) {
                this.state = 'AT_CORE';
                this.timer = 0;
            }
        }
        else if (this.state === 'AT_CORE') {
            this.timer += 16;
            this.x = stemBaseX;
            this.y = hubY;
            
            // Wait for both a minimum visual dwell AND the processing signal
            if (this.isProcessing && this.timer > this.coreDuration) {
                this.state = 'STEM_TO_LILY';
                this.timer = 0;
            }
        }
        else if (this.state === 'STEM_TO_LILY') {
            this.timer += 16;
            const t = Math.min(1, this.timer / 400); // Quick travel to lily center
            this.x = stemBaseX;
            const dist = hubY - stemTipY;
            this.y = hubY - (dist * t);
            
            if (t >= 1) {
                this.state = 'PEDICEL';
                this.timer = 0;
            }
        }
        else if (this.state === 'PEDICEL') {
            this.timer += 16;
            const t = Math.min(1, this.timer / this.pedicelDuration);
            const easedT = easeInOutQuad(t);
            
            const startX = stemBaseX;
            const startY = stemTipY;
            const endX = this.targetHead.x;
            const endY = this.targetHead.y;
            
            const cpX = (startX + endX) / 2;
            const cpY = (startY + endY) / 2 - 15; 

            const p0 = {x: startX, y: startY};
            const p1 = {x: cpX, y: cpY}; 
            const p2 = {x: endX, y: endY}; 
            
            const pos = getQuadBezierPoint(easedT, p0, p1, p2);
            this.x = pos.x;
            this.y = pos.y;

            if (t >= 1) {
                this.state = 'PISTIL';
                this.timer = 0;
            }
        }
        else if (this.state === 'PISTIL') {
            this.timer += 16;
            const t = Math.min(1, this.timer / this.pistilDuration);
            const easedT = easeInOutQuad(t);

            const effectiveScale = baseScale * this.targetHead.scaleMultiplier;

            const geom = this.targetPistil.getGeometry(
                this.targetHead.x, 
                this.targetHead.y, 
                this.targetHead.rotation, 
                effectiveScale, 
                timeSinceStart
            );
            
            if (geom) {
                const pos = getBezierPoint(easedT, geom.p0, geom.p1, geom.p2, geom.p3);
                this.x = pos.x;
                this.y = pos.y;
            }

            if (t >= 1) {
                this.state = 'FLOAT';
                this.timer = 0;
                this.flower.shatterPistil(this.targetHead, this.targetPistil, effectiveScale, timeSinceStart);
            }
        }
        else if (this.state === 'FLOAT') {
            this.timer += 16;
            // CHANGE: Reduced max growth size (5.5) and growth rate (0.05)
            if (this.radius < 5.5) this.radius += 0.05; 
            this.y -= 0.8; 
            this.x += Math.sin(this.timer * 0.002 + this.floatPhase) * 0.3;
            
            if (this.y < -100) this.finished = true;
        }
    }

    draw(ctx) {
        ctx.save();
        
        if (this.isDryRun) {
            ctx.filter = 'blur(8px)';
            ctx.globalAlpha = 0.3;
        }

        const time = Date.now();
        const pulse = 1 + Math.sin(time * this.pulseSpeed + this.pulseOffset) * 0.2;
        
        // CHANGE: Reduced glow multiplier to make it less intense
        const glowRadius = this.radius * (this.state === 'FLOAT' ? 2.5 : 3.5) * pulse;

        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
        grad.addColorStop(0, this.color);
        // CHANGE: Significantly reduced opacity at the mid-point (was 0.4 or 1.0)
        grad.addColorStop(0.5, this.color + '33'); // ~20% opacity
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.globalCompositeOperation = 'screen';
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // CHANGE: Reduced white center size to 0.4x radius
        const coreRadius = this.radius * 0.4; 
        
        ctx.shadowBlur = 10; 
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = '#ffffff';

        if (this.state === 'FLOAT' && this.img && this.img.complete && this.img.naturalWidth !== 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, coreRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class FlowerHead {
    constructor(offsetX, offsetY, rotation, scaleMultiplier) {
        this.offsetX = offsetX; 
        this.offsetY = offsetY;
        this.rotation = rotation; 
        this.scaleMultiplier = scaleMultiplier;
        
        this.pistils = [];
        this.petals = [];
        
        this.x = 0;
        this.y = 0; 
        
        this.initParts();
    }

    initParts() {
        const pistilFan = Math.PI * 0.6; 
        for (let i = 0; i < CONFIG.stamenCountPerHead; i++) {
            const t = i / (CONFIG.stamenCountPerHead - 1);
            const relAngle = -pistilFan/2 + pistilFan * t;
            this.pistils.push(new Pistil(relAngle, i));
        }

        const petalFan = Math.PI * 1.5;
        for (let i = 0; i < CONFIG.petalCountPerHead; i++) {
            const t = i / (CONFIG.petalCountPerHead - 1);
            const relAngle = -petalFan/2 + petalFan * t;
            this.petals.push(new Petal(relAngle));
        }
    }

    updatePos(stemTipX, stemTipY) {
        this.x = stemTipX + this.offsetX;
        this.y = stemTipY + this.offsetY;
    }
}

class Flower {
    constructor() {
        this.startTime = performance.now();
        this.heads = [];
        this.particles = [];
        this.orbs = new Map(); // requestId -> SpiritOrb
        this.baseScale = Math.min(width, height) * 0.22;
        
        this.initHeads();
    }

    initHeads() {
        this.heads = [];
        // Head 0: Middle (Center/Back)
        this.heads.push(new FlowerHead(this.baseScale * 0.05, -this.baseScale * 0.35, -Math.PI/2 - 0.1, 1.0));
        
        // Head 1: Left - Brought in tighter
        this.heads.push(new FlowerHead(-this.baseScale * 0.3, this.baseScale * 0.05, -Math.PI * 0.85, 0.9));
        
        // Head 2: Right - Brought in tighter
        this.heads.push(new FlowerHead(this.baseScale * 0.35, this.baseScale * 0.05, -Math.PI * 0.15, 0.9));
    }

    triggerOrb(data) {
        const { requestId, color, profilePic, isDryRun } = data;
        
        if (isDryRun) {
            this.orbs.set(requestId, new SpiritOrb(this, null, null, requestId, color, profilePic, true));
            return;
        }

        // Collect all available (not gone and not currently targeted) pistils from all heads
        let allAvailable = [];
        this.heads.forEach(h => {
            const availableInHead = h.pistils.filter(p => !p.isGone && !p.isTargeted);
            availableInHead.forEach(p => allAvailable.push({ head: h, pistil: p }));
        });

        if (allAvailable.length === 0) return;
        
        const selection = allAvailable[Math.floor(Math.random() * allAvailable.length)];
        const { head, pistil } = selection;
        
        pistil.isTargeted = true;
        pistil.color = color;
        this.orbs.set(requestId, new SpiritOrb(this, head, pistil, requestId, color, profilePic));
    }

    shatterPistil(head, pistil, baseScale, time) {
        pistil.isGone = true;
        pistil.isTargeted = false; // Release target status early so it can be picked once respawned
        pistil.respawnTime = time + 4000; // Slightly shorter respawn for more activity
        
        const geom = pistil.getGeometry(head.x, head.y, head.rotation, baseScale, time);
        if (!geom) return;

        const segments = 50; 
        const baseColor = pistil.color || CONFIG.stamenColor;
        const endColor = pistil.color ? '#ffffff' : '#ffaaaa';

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const pos = getBezierPoint(t, geom.p0, geom.p1, geom.p2, geom.p3);
            
            let pColor;
            if (t < 0.4) {
                pColor = lerpColor('#600000', baseColor, t / 0.4);
            } else {
                pColor = lerpColor(baseColor, endColor, (t - 0.4) / 0.6);
            }
            
            this.particles.push(new Particle(pos.x, pos.y, pColor));
        }
    }

    drawHeadComponents(headIndex, drawPistils, drawPetals, drawOrbs, stemBaseX, stemBaseY, stemTipY, timeSinceStart) {
        const head = this.heads[headIndex];

        if (drawOrbs) {
            for (const orb of this.orbs.values()) {
                if (!orb.finished && orb.targetHead === head) {
                    if (orb.state === 'PISTIL' || orb.state === 'FLOAT') {
                        orb.update(stemBaseX, stemBaseY, stemTipY, this.baseScale, timeSinceStart);
                        orb.draw(ctx);
                    }
                }
            }
        }

        if (drawPetals) {
            head.petals.forEach(p => p.draw(head.x, head.y, head.rotation, this.baseScale * head.scaleMultiplier, timeSinceStart));
        }

        if (drawPistils) {
            head.pistils.forEach(p => p.draw(head.x, head.y, head.rotation, this.baseScale * head.scaleMultiplier, timeSinceStart));
        }
    }

    draw(currentTime) {
        const timeSinceStart = currentTime - this.startTime;
        
        const stemBaseX = width / 2;
        const stemBaseY = height;
        const stemTipY = height * 0.6; // Maintained 60% position

        this.heads.forEach(h => h.updatePos(stemBaseX, stemTipY));

        // Draw Dry Run Orbs in the far background
        for (const orb of this.orbs.values()) {
            if (!orb.finished && orb.isDryRun) {
                orb.update(stemBaseX, stemBaseY, stemTipY, this.baseScale, timeSinceStart);
                orb.draw(ctx);
            }
        }

        this.heads.forEach(h => {
            h.pistils.forEach(p => {
                if (p.isGone && timeSinceStart > p.respawnTime) {
                    p.isGone = false; 
                    p.isTargeted = false; 
                    p.startDelay = timeSinceStart; 
                    p.color = null;
                    p.claimedBy = null;
                }
            });
        });

        // --- LAYER 1: BACK (Flower 0/Middle) ---
        this.drawHeadComponents(0, false, true, false, stemBaseX, stemBaseY, stemTipY, timeSinceStart); // Petals
        this.drawHeadComponents(0, true, false, true, stemBaseX, stemBaseY, stemTipY, timeSinceStart);  // Pistils & Orbs

        // --- LAYER 2: MIDDLE (Stems) ---
        this.drawMainStem(stemBaseX, stemBaseY, stemTipY, timeSinceStart);
        this.drawPedicels(stemBaseX, stemTipY, timeSinceStart);
        
        for (const orb of this.orbs.values()) {
             if (!orb.finished && !orb.isDryRun && (orb.state === 'WAITING' || orb.state === 'STEM' || orb.state === 'AT_CORE' || orb.state === 'STEM_TO_LILY' || orb.state === 'PEDICEL')) {
                 orb.update(stemBaseX, stemBaseY, stemTipY, this.baseScale, timeSinceStart);
                 orb.draw(ctx);
             }
        }

        // --- LAYER 3: FRONT (Flower 1 & 2 / Left & Right) ---
        this.drawHeadComponents(1, false, true, false, stemBaseX, stemBaseY, stemTipY, timeSinceStart);
        this.drawHeadComponents(1, true, false, true, stemBaseX, stemBaseY, stemTipY, timeSinceStart);
        
        this.drawHeadComponents(2, false, true, false, stemBaseX, stemBaseY, stemTipY, timeSinceStart);
        this.drawHeadComponents(2, true, false, true, stemBaseX, stemBaseY, stemTipY, timeSinceStart);

        // --- LAYER 4: TOP (Particles) ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            this.particles[i].draw(ctx);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        
        for (const [id, orb] of this.orbs.entries()) {
            if (orb.finished) this.orbs.delete(id);
        }
    }

    drawMainStem(x, baseY, tipY, time) {
        const progress = Math.min(1, time / 1000);
        const eased = easeOutCubic(progress);
        const currentTipY = baseY - (baseY - tipY) * eased;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x, currentTipY);
        ctx.strokeStyle = CONFIG.stemColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    drawPedicels(centerX, centerY, time) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = CONFIG.stemColor;

        ctx.beginPath();
        ctx.fillStyle = '#601010'; 
        ctx.arc(centerX, centerY, 6, 0, Math.PI*2);
        ctx.fill();

        this.heads.forEach(h => {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            const cpX = (centerX + h.x) / 2;
            const cpY = (centerY + h.y) / 2 - 15; 
            ctx.quadraticCurveTo(cpX, cpY, h.x, h.y);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(h.x, h.y, 7, 0, Math.PI*2);
            ctx.fillStyle = '#550000';
            ctx.fill();
        });
    }
}

// --- Functions ---

function resize() {
    width = container.clientWidth;
    height = container.clientHeight;

    canvas.width = width;
    canvas.height = height;
    
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    const newBaseScale = Math.min(width, height) * 0.22;

    if (flower) {
        flower.baseScale = newBaseScale;
        flower.initHeads();
    } else {
        flower = new Flower();
        flower.baseScale = newBaseScale;
    }
}

async function handleUpdate(data) {
    const { pageId, status, requestId, profilePic, isDryRun } = data;
    const neonRed = '#ff2828'; 

    if (status === 'queued') {
        flower.triggerOrb({ requestId, color: neonRed, profilePic, pageId, isDryRun });
    } else if (status === 'processing') {
        processingPages.add(pageId);
        coreHub.classList.add('active-core');
        coreHub.style.setProperty('filter', `drop-shadow(0 0 25px ${neonRed})`, 'important');
        
        const orb = flower.orbs.get(requestId);
        if (orb) orb.isProcessing = true;
    } else if (status === 'completed' || status === 'failed') {
        processingPages.delete(pageId);
        if (processingPages.size === 0) {
            coreHub.classList.remove('active-core');
            coreHub.style.filter = '';
        }
    }
}

function animate(currentTime) {
    ctx.clearRect(0, 0, width, height);
    if (flower) flower.draw(currentTime);
    requestAnimationFrame(animate);
}

socket.on('queue_update', handleUpdate);
window.addEventListener('resize', resize);
window.addEventListener('pointerdown', () => {
    // Simulate a data received event
    const mockId = Math.random().toString(36).substring(7);
    handleUpdate({
        pageId: 'simulated-page-' + (Math.floor(Math.random() * 5)),
        status: 'queued',
        requestId: mockId,
        profilePic: null
    });
});

resize();
requestAnimationFrame(animate);