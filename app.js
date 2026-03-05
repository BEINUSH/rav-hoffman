'use strict';

// ─── Canvas setup ────────────────────────────────────────────────────────────
const drawCanvas    = document.getElementById('drawing-canvas');
const previewCanvas = document.getElementById('preview-canvas');
const ctx           = drawCanvas.getContext('2d');
const pCtx          = previewCanvas.getContext('2d');
const canvasWrap    = document.getElementById('canvas-wrap');

const CANVAS_W = 1200;
const CANVAS_H = 800;

function initCanvas() {
  drawCanvas.width    = CANVAS_W;
  drawCanvas.height   = CANVAS_H;
  previewCanvas.width = CANVAS_W;
  previewCanvas.height= CANVAS_H;
  canvasWrap.style.minWidth  = CANVAS_W + 'px';
  canvasWrap.style.minHeight = CANVAS_H + 'px';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

initCanvas();

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  tool:        'pencil',
  color:       '#e74c3c',
  size:        16,
  opacity:     1,
  drawing:     false,
  lastX:       0,
  lastY:       0,
  midX:        0,   // bezier midpoint
  midY:        0,
  currentSize: 16,  // dynamic width (velocity-based)
  startX:      0,
  startY:      0,
  rainbowHue:  0,
};

const undoStack = [];
const redoStack = [];
const MAX_UNDO  = 40;

// ─── Undo / Redo ─────────────────────────────────────────────────────────────
function saveState() {
  undoStack.push(drawCanvas.toDataURL());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(drawCanvas.toDataURL());
  restoreState(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(drawCanvas.toDataURL());
  restoreState(redoStack.pop());
}

function restoreState(dataURL) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataURL;
}

// ─── Get canvas-relative coords ──────────────────────────────────────────────
function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
  const clientY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
  return {
    x:        (clientX - rect.left) * scaleX,
    y:        (clientY - rect.top)  * scaleY,
    pressure: e.pressure > 0 ? e.pressure : 0.5,  // stylus pressure, default 0.5
  };
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function setCtxStyle(context) {
  context.globalAlpha        = state.opacity;
  context.strokeStyle        = state.color;
  context.fillStyle          = state.color;
  context.lineWidth          = state.size;
  context.lineCap            = 'round';
  context.lineJoin           = 'round';
}

function drawFreehand(x, y, pressure) {
  // Velocity-based width: slow → thick, fast → thin (like a real pen)
  const dx    = x - state.lastX;
  const dy    = y - state.lastY;
  const speed = Math.sqrt(dx * dx + dy * dy);
  const targetSize = Math.max(state.size * 0.3,
                              state.size * (1.4 - Math.min(speed / 40, 1)));
  // Smooth the size change so it doesn't jump
  state.currentSize += (targetSize - state.currentSize) * 0.3;

  // Quadratic bezier through midpoints → silky smooth curves
  const midX = (state.lastX + x) / 2;
  const midY = (state.lastY + y) / 2;

  ctx.globalAlpha  = state.opacity;
  ctx.strokeStyle  = state.color;
  ctx.lineWidth    = state.currentSize * (pressure ?? 0.5) * 2;
  ctx.lineCap      = 'round';
  ctx.lineJoin     = 'round';
  ctx.beginPath();
  ctx.moveTo(state.midX, state.midY);
  ctx.quadraticCurveTo(state.lastX, state.lastY, midX, midY);
  ctx.stroke();

  state.midX  = midX;
  state.midY  = midY;
  state.lastX = x;
  state.lastY = y;
}

function drawBrush(x, y) {
  setCtxStyle(ctx);
  const r = state.size * 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // soft gradient effect
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexToRgba(state.color, state.opacity));
  g.addColorStop(1, hexToRgba(state.color, 0));
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  state.lastX = x;
  state.lastY = y;
}

function drawSpray(x, y) {
  ctx.globalAlpha = state.opacity;
  ctx.fillStyle   = state.color;
  const density = 30;
  const radius  = state.size * 3;
  for (let i = 0; i < density; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const dist   = Math.random() * radius;
    const sx     = x + Math.cos(angle) * dist;
    const sy     = y + Math.sin(angle) * dist;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  state.lastX = x;
  state.lastY = y;
}

function drawEraser(x, y) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, state.size * 1.5, 0, Math.PI * 2);
  ctx.fill();
  state.lastX = x;
  state.lastY = y;
}

function drawRainbow(x, y) {
  state.rainbowHue = (state.rainbowHue + 3) % 360;
  const midX = (state.lastX + x) / 2;
  const midY = (state.lastY + y) / 2;
  ctx.globalAlpha = state.opacity;
  ctx.strokeStyle = `hsl(${state.rainbowHue},100%,50%)`;
  ctx.lineWidth   = state.size;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(state.midX, state.midY);
  ctx.quadraticCurveTo(state.lastX, state.lastY, midX, midY);
  ctx.stroke();
  state.midX  = midX;
  state.midY  = midY;
  state.lastX = x;
  state.lastY = y;
}

function drawStar(x, y) {
  const spikes = 5;
  const outerR = state.size * 3;
  const innerR = outerR * 0.4;
  setCtxStyle(ctx);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r     = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    i === 0 ? ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
            : ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(x, y) {
  const s = state.size * 2.5;
  setCtxStyle(ctx);
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3,  x - s, y - s * 0.3,  x - s, y + s * 0.2);
  ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s,           x, y + s * 1.1);
  ctx.bezierCurveTo(x, y + s,           x + s, y + s * 0.7, x + s, y + s * 0.2);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3,    x, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawText(x, y) {
  const txt = prompt('הקלידי טקסט:');
  if (!txt) return;
  setCtxStyle(ctx);
  ctx.font = `bold ${state.size * 3}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(txt, x, y);
}

function drawFilledRect(x, y) {
  setCtxStyle(ctx);
  ctx.fillRect(state.startX, state.startY, x - state.startX, y - state.startY);
}

function drawFilledCircle(x, y) {
  setCtxStyle(ctx);
  const rx = (x - state.startX) / 2;
  const ry = (y - state.startY) / 2;
  const cx = state.startX + rx;
  const cy = state.startY + ry;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

// Preview shapes
function previewLine(x, y) {
  pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  setCtxStyle(pCtx);
  pCtx.beginPath();
  pCtx.moveTo(state.startX, state.startY);
  pCtx.lineTo(x, y);
  pCtx.stroke();
}

function previewRect(x, y) {
  pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  setCtxStyle(pCtx);
  const w = x - state.startX;
  const h = y - state.startY;
  pCtx.strokeRect(state.startX, state.startY, w, h);
}

function previewCircle(x, y) {
  pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  setCtxStyle(pCtx);
  const rx = (x - state.startX) / 2;
  const ry = (y - state.startY) / 2;
  const cx = state.startX + rx;
  const cy = state.startY + ry;
  pCtx.beginPath();
  pCtx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  pCtx.stroke();
}

// Commit shapes to main canvas
function commitLine(x, y) {
  setCtxStyle(ctx);
  ctx.beginPath();
  ctx.moveTo(state.startX, state.startY);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function commitRect(x, y) {
  setCtxStyle(ctx);
  ctx.strokeRect(state.startX, state.startY, x - state.startX, y - state.startY);
}

function commitCircle(x, y) {
  setCtxStyle(ctx);
  const rx = (x - state.startX) / 2;
  const ry = (y - state.startY) / 2;
  const cx = state.startX + rx;
  const cy = state.startY + ry;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ─── Flood fill ──────────────────────────────────────────────────────────────
function floodFill(startX, startY, fillColor) {
  const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data    = imgData.data;
  const [fr, fg, fb, fa] = hexToRGBA(fillColor);

  const idx   = (Math.round(startY) * CANVAS_W + Math.round(startX)) * 4;
  const sr = data[idx], sg = data[idx+1], sb = data[idx+2], sa = data[idx+3];

  if (sr === fr && sg === fg && sb === fb && sa === fa) return;

  const queue  = [Math.round(startX), Math.round(startY)];
  const visited = new Uint8Array(CANVAS_W * CANVAS_H);

  function match(i) {
    return data[i]===sr && data[i+1]===sg && data[i+2]===sb && data[i+3]===sa;
  }
  function paint(i) {
    data[i]=fr; data[i+1]=fg; data[i+2]=fb; data[i+3]=fa;
  }

  while (queue.length) {
    const cx = queue.shift(), cy = queue.shift();
    if (cx<0||cx>=CANVAS_W||cy<0||cy>=CANVAS_H) continue;
    const vi = cy * CANVAS_W + cx;
    if (visited[vi]) continue;
    visited[vi] = 1;
    const pi = vi * 4;
    if (!match(pi)) continue;
    paint(pi);
    queue.push(cx+1,cy, cx-1,cy, cx,cy+1, cx,cy-1);
  }
  ctx.putImageData(imgData, 0, 0);
}

function hexToRGBA(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b, 255];
}

function hexToRgba(hex, alpha) {
  const [r,g,b] = hexToRGBA(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Event handlers ───────────────────────────────────────────────────────────
function onPointerDown(e) {
  e.preventDefault();
  const {x, y, pressure} = getPos(e);
  if (e.pointerId !== undefined) canvasWrap.setPointerCapture(e.pointerId);
  state.drawing     = true;
  state.lastX       = x;
  state.lastY       = y;
  state.midX        = x;   // reset bezier anchor
  state.midY        = y;
  state.currentSize = state.size;
  state.startX      = x;
  state.startY      = y;

  saveState();

  if (state.tool === 'fill') { floodFill(x, y, state.color); state.drawing = false; return; }
  if (state.tool === 'star')  { drawStar(x, y);  state.drawing = false; return; }
  if (state.tool === 'heart') { drawHeart(x, y); state.drawing = false; return; }
  if (state.tool === 'text')  { drawText(x, y);  state.drawing = false; return; }

  // Single dot for pencil/brush
  if (state.tool === 'pencil') {
    setCtxStyle(ctx);
    ctx.beginPath();
    ctx.arc(x, y, state.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.tool === 'eraser') drawEraser(x, y);
}

function onPointerMove(e) {
  e.preventDefault();
  if (!state.drawing) return;
  const {x, y, pressure} = getPos(e);

  switch (state.tool) {
    case 'pencil':        drawFreehand(x, y, pressure); break;
    case 'brush':         drawBrush(x, y);      break;
    case 'spray':         drawSpray(x, y);      break;
    case 'rainbow':       drawRainbow(x, y);    break;
    case 'eraser':        drawEraser(x, y);     break;
    case 'line':          previewLine(x, y);    break;
    case 'rect':          previewRect(x, y);    break;
    case 'circle':        previewCircle(x, y);  break;
    case 'filled-rect':   previewRect(x, y);    break;
    case 'filled-circle': previewCircle(x, y);  break;
  }
}

function onPointerUp(e) {
  if (!state.drawing) return;
  state.drawing = false;
  const {x, y} = getPos(e);

  pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  switch (state.tool) {
    case 'line':          commitLine(x, y);        break;
    case 'rect':          commitRect(x, y);         break;
    case 'circle':        commitCircle(x, y);       break;
    case 'filled-rect':   drawFilledRect(x, y);     break;
    case 'filled-circle': drawFilledCircle(x, y);   break;
  }
}

// Use Pointer Events (handles mouse, touch, and stylus with pressure)
canvasWrap.addEventListener('pointerdown',   onPointerDown);
canvasWrap.addEventListener('pointermove',   onPointerMove);
canvasWrap.addEventListener('pointerup',     onPointerUp);
canvasWrap.addEventListener('pointerleave',  onPointerUp);
canvasWrap.addEventListener('pointercancel', onPointerUp);

// Cursor style
canvasWrap.addEventListener('pointermove', () => {
  if      (state.tool === 'fill')   canvasWrap.style.cursor = 'cell';
  else if (state.tool === 'eraser') canvasWrap.style.cursor = 'cell';
  else                              canvasWrap.style.cursor = 'crosshair';
});

// ─── Tool buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tool = btn.dataset.tool;
  });
});

// ─── Color palette ────────────────────────────────────────────────────────────
const colorPicker   = document.getElementById('color-picker');
const colorPreview  = document.getElementById('color-preview');
const colorHex      = document.getElementById('color-hex');

function setColor(hex) {
  state.color = hex;
  colorPicker.value = hex;
  colorPreview.style.background = hex;
  colorHex.textContent = hex;
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === hex);
  });
}

document.querySelectorAll('.swatch').forEach(swatch => {
  swatch.addEventListener('click', () => setColor(swatch.dataset.color));
});

colorPicker.addEventListener('input', () => setColor(colorPicker.value));

// init
setColor(state.color);

// ─── Big eraser button ────────────────────────────────────────────────────────
document.getElementById('btn-big-eraser').addEventListener('click', () => {
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-eraser').classList.add('active');
  state.tool = 'eraser';
  state.size = 32;
  brushSize.value = 32;
  updateBrushPreview();
});

// ─── Size presets ─────────────────────────────────────────────────────────────
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.size = parseInt(btn.dataset.size);
    brushSize.value = state.size;
    updateBrushPreview();
  });
});

// ─── Brush size ───────────────────────────────────────────────────────────────
const brushSize    = document.getElementById('brush-size');
const brushPreview = document.getElementById('brush-preview');
const bpCtx        = brushPreview.getContext('2d');

function updateBrushPreview() {
  bpCtx.clearRect(0, 0, 80, 80);
  bpCtx.fillStyle = state.color;
  bpCtx.globalAlpha = state.opacity;
  bpCtx.beginPath();
  bpCtx.arc(40, 40, Math.min(state.size * 1.5, 38), 0, Math.PI * 2);
  bpCtx.fill();
  bpCtx.globalAlpha = 1;
}

brushSize.addEventListener('input', () => {
  state.size = parseInt(brushSize.value);
  updateBrushPreview();
});

// ─── Opacity ─────────────────────────────────────────────────────────────────
const opacitySlider = document.getElementById('opacity-slider');
const opacityLabel  = document.getElementById('opacity-label');

opacitySlider.addEventListener('input', () => {
  state.opacity = parseInt(opacitySlider.value) / 100;
  opacityLabel.textContent = opacitySlider.value + '%';
  updateBrushPreview();
});

// Refresh brush preview when color changes
const origSetColor = setColor;
// already calls updateBrushPreview via input handler; call directly:
colorPicker.addEventListener('input', updateBrushPreview);
document.querySelectorAll('.swatch').forEach(s =>
  s.addEventListener('click', updateBrushPreview)
);

updateBrushPreview();

// ─── Undo / Redo buttons ─────────────────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

// ─── Clear ───────────────────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('לנקות את כל הציור? 🗑️')) return;
  saveState();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bgColorPicker.value;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  notify('הציור נוקה! 🧹');
});

// ─── Background color ─────────────────────────────────────────────────────────
const btnBg        = document.getElementById('btn-bg');
const bgColorPicker= document.getElementById('bg-color-picker');

btnBg.addEventListener('click', () => bgColorPicker.click());

bgColorPicker.addEventListener('input', () => {
  saveState();
  const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = bgColorPicker.value;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.putImageData(imgData, 0, 0);
});

// ─── Save ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', () => {
  const link = document.createElement('a');
  const now   = new Date();
  const ts    = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  link.download = `ציור-${ts}.png`;
  link.href     = drawCanvas.toDataURL('image/png');
  link.click();
  notify('הציור נשמר! 💾✨');
});

function pad(n) { return String(n).padStart(2,'0'); }

// ─── Notification ─────────────────────────────────────────────────────────────
const notifEl = document.getElementById('notification');
let notifTimer;

function notify(msg) {
  notifEl.textContent = msg;
  notifEl.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => notifEl.classList.remove('show'), 2500);
}
