const socket = io();

const container = document.querySelector('.cyber-container');
const nodesLayer = document.getElementById('nodes-layer');
const coreHub = document.getElementById('core-hub');
const hubStatus = document.getElementById('hub-status');
const svgLayer = document.getElementById('pipeline-svg');
const packetLayer = document.getElementById('packet-layer');

// State
const pageNodes = new Map(); 
const activePackets = new Map(); 
const movingPackets = new Set(); // { el, pathEl, startTime, duration, reverse, resolve }
const pendingPages = new Set(); 
const processingPages = new Set(); 
let rotationTimer = null;

const INACTIVITY_MS = 60000;
const NEON_COLORS = [
  '#ff007f', '#ffff00', '#00f3ff', '#00ff00', '#ff00ff', '#ff4d00', '#bc00ff', '#00ffa3'
];

fetch('/v1/stats').then(res => res.json()).then(data => {
  if (data.dryRun) document.getElementById('dry-run-banner').style.display = 'block';
});

hubStatus.textContent = '';

socket.on('queue_update', (data) => handleUpdate(data));

function getColorForPage(pageId) {
  let hash = 0;
  for (let i = 0; i < pageId.length; i++) {
    hash = pageId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NEON_COLORS[Math.abs(hash) % NEON_COLORS.length];
}

async function handleUpdate(data) {
  const { pageId, status, isDryRun, requestId, profilePic } = data;
  const pageColor = getColorForPage(pageId);

  if (!pageNodes.has(pageId)) {
    if (pendingPages.has(pageId)) {
      await waitForSetup(pageId);
    } else {
      await setupPageNode(pageId, profilePic, pageColor);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  const node = pageNodes.get(pageId);
  if (!node) return;
  node.lastActivity = Date.now();

  const containerHeight = container.getBoundingClientRect().height;

  if (status === 'queued') {
    // 1. STEM FLOW (Input)
    const p = createPacketElement(requestId, 'input', isDryRun, pageColor, node.startX, containerHeight);
    
    // Animate along the STEM path
    const arrival = movePacketAlongPath(p, node.stemWire, 1200, false).then(() => {
      p.classList.add('parked-at-hub');
      p.style.opacity = '0'; 
    });

    activePackets.set(requestId, { element: p, status: 'traveling_in', arrivalPromise: arrival, pageId });
  } 
  else if (status === 'processing') {
    processingPages.add(pageId);
    startHubEffect(isDryRun, pageId, pageColor);
    
    const packetData = activePackets.get(requestId);
    if (packetData) {
      await packetData.arrivalPromise;
      packetData.status = 'processing';
      packetData.element.style.opacity = '1';
      packetData.element.classList.add('processing-glow');
      packetData.element.style.setProperty('box-shadow', `0 0 20px ${pageColor}`, 'important');
    }
  } 
  else if (status === 'completed' || status === 'failed') {
    processingPages.delete(pageId);
    stopHubEffect(pageId);

    const type = status === 'completed' ? 'success' : 'fail';
    node.el.style.setProperty('border-color', pageColor, 'important');
    node.el.style.setProperty('box-shadow', `0 0 25px ${pageColor}`, 'important');
    setTimeout(() => {
      node.el.style.boxShadow = `0 0 15px rgba(0,0,0,0.5)`;
    }, 500);
    
    const packetData = activePackets.get(requestId);
    if (packetData) {
      await packetData.arrivalPromise;
      await new Promise(resolve => setTimeout(resolve, 500));

      const p = packetData.element;
      p.classList.remove('processing-glow');
      p.style.opacity = '1';
      p.classList.add(type);
      
      packetData.status = 'traveling_out';
      // Animate along the PETAL path (Hub -> Node)
      await movePacketAlongPath(p, node.wirePath, 1000, true);
      p.remove();
      activePackets.delete(requestId);
    }
  }
}

function createPacketElement(requestId, type, isDryRun, color, x, y) {
  const p = document.createElement('div');
  p.className = `packet ${type} ${isDryRun ? 'dry' : ''}`;
  p.style.setProperty('background-color', color, 'important');
  p.style.setProperty('box-shadow', `0 0 12px ${color}`, 'important');
  p.style.left = `${x}px`;
  p.style.top = `${y}px`;
  packetLayer.appendChild(p);
  return p;
}

// Unified Movement Engine
function movePacketAlongPath(el, pathEl, duration, reverse) {
  return new Promise(resolve => {
    movingPackets.add({
      el,
      pathEl,
      duration,
      reverse,
      resolve,
      startTime: Date.now()
    });
  });
}

function startHubEffect(isDryRun, pageId, color) {
  coreHub.classList.add('active-core');
  coreHub.style.setProperty('filter', `drop-shadow(0 0 25px ${color})`, 'important');
  const coreInner = coreHub.querySelector('.core-inner');
  if (coreInner) {
    coreInner.style.setProperty('color', color, 'important');
    coreInner.style.setProperty('text-shadow', `0 0 20px ${color}`, 'important');
  }
  const count = processingPages.size;
  hubStatus.textContent = (isDryRun ? '[DRY] ' : '') + (count > 1 ? `SYNCING ${count} PROJECTS` : `SYNCING: ${pageId.slice(0,8)}`);
  hubStatus.style.setProperty('color', color, 'important');
}

function stopHubEffect(pageId) {
  if (processingPages.size > 0) return;
  coreHub.classList.remove('active-core');
  coreHub.style.filter = '';
  const coreInner = coreHub.querySelector('.core-inner');
  if (coreInner) {
    coreInner.style.color = '';
    coreInner.style.textShadow = '';
  }
  hubStatus.textContent = '';
  hubStatus.style.color = '';
}

function waitForSetup(pageId) {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (pageNodes.has(pageId)) { clearInterval(interval); resolve(); }
    }, 50);
  });
}

function setupPageNode(pageId, profilePic, color) {
  return new Promise(resolve => {
    pendingPages.add(pageId);
    const div = document.createElement('div');
    div.className = 'dock';
    div.style.setProperty('border-color', color, 'important');
    div.innerHTML = `<div class="dock-glow" style="border-color: ${color} !important;"></div><img src="${profilePic}" onerror="this.src='https://placehold.co/40?text=USMM'">`;
    nodesLayer.appendChild(div);

    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    let angle;
    do {
      angle = Math.random() * Math.PI * 2;
    } while (angle > Math.PI * 0.3 && angle < Math.PI * 0.7);

    const radius = Math.min(centerX, centerY) * (0.5 + Math.random() * 0.3);
    const startX = centerX + Math.cos(angle) * radius;
    const startY = centerY + Math.sin(angle) * radius;

    // Permanent Stem Wire (Rectangular) - NARROWER
    const stemWire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stemWire.setAttribute('class', 'wire-path');
    stemWire.style.setProperty('stroke', color, 'important');
    stemWire.style.setProperty('opacity', '0.15', 'important');
    
    const sWidth = 60; // Narrower width
    const nodeStartX = centerX + (Math.random() - 0.5) * sWidth;
    stemWire.setAttribute('d', `M ${nodeStartX} ${containerRect.height} L ${nodeStartX} ${centerY} L ${centerX} ${centerY}`);
    svgLayer.appendChild(stemWire);

    // Permanent Petal Wire
    const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wire.setAttribute('class', 'wire-path');
    wire.style.setProperty('stroke', color, 'important');
    wire.style.setProperty('opacity', '0.3', 'important');
    svgLayer.appendChild(wire);

    const nodeState = { 
      el: div, 
      wirePath: wire, 
      stemWire: stemWire,
      startX: nodeStartX,
      x: startX, 
      y: startY, 
      vx: 0, 
      vy: 0, 
      color, 
      lastActivity: Date.now() 
    };
    pageNodes.set(pageId, nodeState);
    pendingPages.delete(pageId);
    resolve();
  });
}

function getEase(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function animate() {
  const containerRect = container.getBoundingClientRect();
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;
  const now = Date.now();

  for (const [id, node] of pageNodes.entries()) {
    // Physics
    for (const [otherId, otherNode] of pageNodes.entries()) {
      if (id === otherId) continue;
      const dx = node.x - otherNode.x;
      const dy = node.y - otherNode.y;
      const distSq = dx*dx + dy*dy;
      if (distSq < 4900 && distSq > 0) {
        const force = 15 / distSq;
        node.vx += dx * force;
        node.vy += dy * force;
      }
    }

    const dcx = node.x - centerX;
    const dcy = node.y - centerY;
    const distCenter = Math.sqrt(dcx*dcx + dcy*dcy);

    // 2. Hub Repulsion (Don't let them overlap the core)
    if (distCenter < 160) {
      const force = (160 - distCenter) * 0.005;
      node.vx += (dcx / distCenter) * force;
      node.vy += (dcy / distCenter) * force;
    }

    // 3. STEM WALL (Exclusion Zone)
    if (node.y > centerY) {
      const distX = Math.abs(node.x - centerX);
      const wallWidth = 80; // slightly wider than the wires for safety
      if (distX < wallWidth) {
        node.vx += (node.x > centerX ? 1 : -1) * 0.15;
        node.vy -= 0.03; 
      }
    }

    // 4. Constant Attraction to Core (Gravity)
    // Petals move inward to fill gaps
    const gravity = 0.015;
    node.vx -= (dcx / distCenter) * gravity;
    node.vy -= (dcy / distCenter) * gravity;

    // 5. Random Jitter
    node.vx += (Math.random() - 0.5) * 0.02;
    node.vy += (Math.random() - 0.5) * 0.02;

    node.x += node.vx;
    node.y += node.vy;
    node.vx *= 0.94;
    node.vy *= 0.94;

    node.el.style.left = `${node.x}px`;
    node.el.style.top = `${node.y}px`;

    const midX = (node.x + centerX) / 2;
    const pathData = `M ${node.x} ${node.y} C ${midX} ${node.y}, ${midX} ${centerY}, ${centerX} ${centerY}`;
    node.wirePath.setAttribute('d', pathData);
    
    node.stemWire.setAttribute('d', `M ${node.startX} ${containerRect.height} L ${node.startX} ${centerY} L ${centerX} ${centerY}`);
  }

  // Unified Packet Movement
  for (const p of movingPackets) {
    const elapsed = now - p.startTime;
    const progress = Math.min(elapsed / p.duration, 1);
    const eased = getEase(progress);
    
    try {
      const totalLength = p.pathEl.getTotalLength();
      const point = p.pathEl.getPointAtLength((p.reverse ? 1 - eased : eased) * totalLength);
      p.el.style.left = `${point.x}px`;
      p.el.style.top = `${point.y}px`;
    } catch (e) {
      // Path might be invalid/removed
    }
    
    if (progress >= 1) { 
      p.resolve(); 
      movingPackets.delete(p); 
    }
  }

  for (const [reqId, data] of activePackets.entries()) {
    if (data.status === 'processing') {
      data.element.style.left = `${centerX}px`;
      data.element.style.top = `${centerY}px`;
    }
  }

  for (const [id, node] of pageNodes.entries()) {
    if (now - node.lastActivity > INACTIVITY_MS && !processingPages.has(id)) {
      node.el.style.opacity = '0';
      node.wirePath.style.opacity = '0';
      node.stemWire.style.opacity = '0';
      setTimeout(() => { 
        node.el.remove(); 
        node.wirePath.remove(); 
        node.stemWire.remove();
      }, 500);
      pageNodes.delete(id);
    }
  }
  requestAnimationFrame(animate);
}

animate();
