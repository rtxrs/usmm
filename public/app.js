const socket = io();

const container = document.querySelector('.cyber-container');
const inputDocksContainer = document.getElementById('input-docks');
const outputDocksContainer = document.getElementById('output-docks');
const coreHub = document.getElementById('core-hub');
const hubStatus = document.getElementById('hub-status');
const svgLayer = document.getElementById('pipeline-svg');
const packetLayer = document.getElementById('packet-layer');

// State
const pageNodes = new Map(); 
const activePackets = new Map(); // requestId -> { element, arrivalPromise }
const pendingPages = new Set(); 
const processingPages = new Set(); 
let rotationTimer = null;

const INACTIVITY_MS = 60000;

fetch('/v1/stats').then(res => res.json()).then(data => {
  if (data.dryRun) document.getElementById('dry-run-banner').style.display = 'block';
});

socket.on('queue_update', (data) => handleUpdate(data));

async function handleUpdate(data) {
  const { pageId, status, profilePic, isDryRun, requestId } = data;

  if (!pageNodes.has(pageId)) {
    if (pendingPages.has(pageId)) await waitForSetup(pageId);
    else await setupPageNodes(pageId, profilePic);
  }

  const nodes = pageNodes.get(pageId);
  if (!nodes) return;
  nodes.lastActivity = Date.now();

  if (status === 'queued') {
    const p = createPacketElement(requestId, 'input', isDryRun);
    // Store the arrival promise so subsequent phases can wait for it
    const arrival = movePacket(p, nodes.inPath, 1200).then(() => {
      p.classList.add('parked-at-hub');
    });
    activePackets.set(requestId, { element: p, arrivalPromise: arrival });
  } 
  else if (status === 'processing') {
    processingPages.add(pageId);
    startRotation(isDryRun, pageId);
    
    const packetData = activePackets.get(requestId);
    if (packetData) {
      await packetData.arrivalPromise;
      packetData.element.classList.add('processing-glow');
    }
  } 
  else if (status === 'completed' || status === 'failed') {
    processingPages.delete(pageId);
    stopRotation(pageId);

    const type = status === 'completed' ? 'success' : 'fail';
    nodes.outDock.className = `dock ${type}-glow-permanent`;
    
    const packetData = activePackets.get(requestId);
    if (packetData) {
      // 1. Wait for input arrival
      await packetData.arrivalPromise;
      
      // 2. Artificial "Processing" dwell time for visibility (min 800ms)
      await new Promise(resolve => setTimeout(resolve, 800));

      const p = packetData.element;
      p.classList.remove('parked-at-hub', 'processing-glow');
      p.classList.add(type);
      
      // 3. Move to Output
      await movePacket(p, nodes.outPath, 1000);
      p.remove();
      activePackets.delete(requestId);
    }
  }
}

function createPacketElement(requestId, type, isDryRun) {
  const p = document.createElement('div');
  p.className = `packet ${type} ${isDryRun ? 'dry' : ''}`;
  if (isDryRun) p.innerHTML = '<span class="packet-label">DRY</span>';
  packetLayer.appendChild(p);
  return p;
}

function movePacket(packetEl, pathEl, duration) {
  return new Promise(resolve => {
    const pathData = pathEl.getAttribute('d');
    packetEl.style.offsetPath = `path('${pathData}')`;
    
    const animation = packetEl.animate([
      { offsetDistance: '0%' },
      { offsetDistance: '100%' }
    ], {
      duration: duration,
      easing: 'ease-in-out',
      fill: 'forwards'
    });

    animation.onfinish = resolve;
  });
}

function startRotation(isDryRun, pageId) {
  if (rotationTimer) clearTimeout(rotationTimer);
  coreHub.classList.add('active-core');
  const count = processingPages.size;
  hubStatus.textContent = (isDryRun ? '[DRY] ' : '') + (count > 1 ? `SYNCING ${count} PROJECTS` : `SYNCING: ${pageId.slice(0,8)}`);
}

function stopRotation(pageId) {
  if (processingPages.size > 0) return;
  if (rotationTimer) clearTimeout(rotationTimer);
  rotationTimer = setTimeout(() => {
    if (processingPages.size === 0) {
      coreHub.classList.remove('active-core');
      hubStatus.textContent = 'READY';
    }
    rotationTimer = null;
  }, 2000);
}

function waitForSetup(pageId) {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (pageNodes.has(pageId)) { clearInterval(interval); resolve(); }
    }, 50);
  });
}

function setupPageNodes(pageId, profilePic) {
  return new Promise(resolve => {
    pendingPages.add(pageId);
    const inDock = createDock(inputDocksContainer, profilePic);
    const outDock = createDock(outputDocksContainer, profilePic);
    setTimeout(() => {
      const inPath = drawWire(inDock, coreHub, 'input');
      const outPath = drawWire(coreHub, outDock, 'output');
      pageNodes.set(pageId, { inDock, outDock, inPath, outPath, lastActivity: Date.now() });
      pendingPages.delete(pageId);
      resolve();
    }, 100);
  });
}

function createDock(container, img) {
  const div = document.createElement('div');
  div.className = 'dock';
  div.innerHTML = `<div class="dock-glow"></div><img src="${img}" onerror="this.src='https://placehold.co/40?text=USMM'">`;
  container.appendChild(div);
  return div;
}

function getRelativeCenter(el) {
  const rect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return { x: (rect.left - containerRect.left) + (rect.width / 2), y: (rect.top - containerRect.top) + (rect.height / 2) };
}

function drawWire(fromEl, toEl, type) {
  const start = getRelativeCenter(fromEl);
  const end = getRelativeCenter(toEl);
  const midX = (start.x + end.x) / 2;
  const pathData = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('class', 'wire-path');
  svgLayer.appendChild(path);
  return path;
}

setInterval(() => {
  const now = Date.now();
  for (const [pageId, nodes] of pageNodes.entries()) {
    if (now - nodes.lastActivity > INACTIVITY_MS && !processingPages.has(pageId)) {
      nodes.inDock.classList.add('fade-out'); nodes.outDock.classList.add('fade-out');
      nodes.inPath.classList.add('fade-out'); nodes.outPath.classList.add('fade-out');
      setTimeout(() => { nodes.inDock.remove(); nodes.outDock.remove(); nodes.inPath.remove(); nodes.outPath.remove(); }, 500);
      pageNodes.delete(pageId);
    }
  }
}, 5000);

window.addEventListener('resize', () => {
  svgLayer.innerHTML = ''; 
  pageNodes.forEach(node => {
    node.inPath = drawWire(node.inDock, coreHub, 'input');
    node.outPath = drawWire(coreHub, node.outDock, 'output');
  });
});