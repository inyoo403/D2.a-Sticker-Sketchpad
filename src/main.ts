import "./style.css";

/* ---------- DOM ---------- */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string; attrs?: Record<string, string> },
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts?.className) el.className = opts.className;
  if (opts?.text) el.textContent = opts.text;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  }
  return el;
}

/* ---------- Layout ---------- */
const app = el("div", { className: "app" });
document.body.appendChild(app);

const title = el("h1", { text: "Paint" });
app.appendChild(title);

const toolbarTop = el("div", { className: "toolbar" });
const toolbarMid = el("div", { className: "toolbar" });
const toolbarBottom = el("div", { className: "toolbar" });
app.appendChild(toolbarTop);
app.appendChild(toolbarMid);
app.appendChild(toolbarBottom);

/* Top: Clear / Undo / Redo */
const clearBtn = el("button", { className: "btn", text: "Clear" });
const undoBtn = el("button", { className: "btn", text: "Undo" });
const redoBtn = el("button", { className: "btn", text: "Redo" });
const exportBtn = el("button", { className: "btn", text: "Export 1024" });
toolbarTop.appendChild(clearBtn);
toolbarTop.appendChild(undoBtn);
toolbarTop.appendChild(redoBtn);
toolbarTop.appendChild(exportBtn);

/* Mid: Thin / Thick */
const thinBtn = el("button", { className: "btn", text: "Thin" });
const thickBtn = el("button", { className: "btn", text: "Thick" });
toolbarMid.appendChild(thinBtn);
toolbarMid.appendChild(thickBtn);

let markerHue = 210;
let stickerRotationDeg = 0;

/* Hue / Rotation sliders  */
const hueWrap = el("div", { className: "control sliderRow" });
const hueLabel = el("label", { text: "Color" });
const hueInput = el("input", {
  attrs: { type: "range", min: "0", max: "360", value: String(markerHue) },
}) as HTMLInputElement;
hueInput.classList.add("color-range");
hueWrap.append(hueLabel, hueInput);

const rotWrap = el("div", { className: "control sliderRow" });
const rotLabel = el("label", { text: "Rotate" });
const rotInput = el("input", {
  attrs: {
    type: "range",
    min: "0",
    max: "360",
    value: String(stickerRotationDeg),
  },
}) as HTMLInputElement;
rotWrap.append(rotLabel, rotInput);

toolbarMid.append(hueWrap, rotWrap);

hueInput.addEventListener("input", () => {
  markerHue = Number(hueInput.value) || 0;
  updateColorSliderUI();
  if (!isDrawing && toolMode === "pen") {
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  }
});

rotInput.addEventListener("input", () => {
  stickerRotationDeg = Number(rotInput.value) || 0;
  if (!isDrawing && toolMode === "sticker" && selectedStickerIdx != null) {
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  }
});

/* Custom */
const stickerRow = el("div", { className: "stickerRow" });
const customBtn = el("button", { className: "btn", text: "Custom +" });
toolbarBottom.append(stickerRow, customBtn);

/* Canvas */
const canvas = el("canvas", {
  className: "sketch",
  attrs: { width: "256", height: "256" },
});
app.appendChild(canvas);

const ctx = canvas.getContext("2d")!;

const THIN_WIDTH = 3;
const THICK_WIDTH = 9;
const DEFAULT_STICKER_SIZE = 36;
const PREVIEW_ALPHA = 0.85;

/* ---------- State ---------- */
type Point = { x: number; y: number };

function posFromPointer(ev: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

interface Displayable {
  display(ctx: CanvasRenderingContext2D): void;
}

function createMarkerLine(initial: Point, width: number, color: string) {
  const pts: Point[] = [initial];
  const obj: Displayable & { drag: (p: Point) => void } = {
    drag(p: Point) {
      pts.push(p);
    },
    display(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      if (pts.length < 2) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
  return obj;
}

function createToolPreviewPen(
  center: Point,
  width: number,
  color: string,
): Displayable {
  return {
    display(ctx) {
      const r = Math.max(1, width / 2);
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.globalAlpha = PREVIEW_ALPHA;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}

function createStickerPreview(
  center: Point,
  emoji: string,
  size: number,
  rotationDeg: number,
): Displayable {
  return {
    display(ctx) {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.font =
        `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.9;
      ctx.fillText(emoji, 0, 0);
      ctx.restore();
    },
  };
}

function createPlaceSticker(
  initial: Point,
  emoji: string,
  size: number,
  rotationDeg: number,
) {
  let at = { ...initial };
  const obj: Displayable & { drag: (p: Point) => void } = {
    drag(p: Point) {
      at = { ...p };
    },
    display(ctx) {
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.font =
        `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 0, 0);
      ctx.restore();
    },
  };
  return obj;
}

const displayList: Displayable[] = [];
const redoStack: Displayable[] = [];
let isDrawing = false;

type ToolMode = "pen" | "sticker";
let toolMode: ToolMode = "pen";

type StickerDef = { glyph: string; size: number };

const STICKERS: StickerDef[] = [
  { glyph: "🍎", size: DEFAULT_STICKER_SIZE },
  { glyph: "🍌", size: DEFAULT_STICKER_SIZE },
  { glyph: "🥝", size: DEFAULT_STICKER_SIZE },
];

let selectedStickerIdx: number | null = null;

let activeCommand: (Displayable & { drag?: (p: Point) => void }) | null = null;
let currentPreview: Displayable | null = null;
let selectedLineWidth = THIN_WIDTH;

function renderStickerButtons() {
  stickerRow.innerHTML = "";
  STICKERS.forEach((s, i) => {
    const b = el("button", { className: "btn", text: s.glyph });
    if (i === selectedStickerIdx) {
      b.classList.add("selected");
      b.setAttribute("aria-pressed", "true");
    }
    b.addEventListener("click", () => selectStickerByIndex(i));
    stickerRow.appendChild(b);
  });
}

function selectStickerByIndex(i: number) {
  toolMode = "sticker";
  selectedStickerIdx = i;
  for (const b of [thinBtn, thickBtn]) {
    b.classList.remove("selected");
    b.removeAttribute("aria-pressed");
  }
  renderStickerButtons();
  currentPreview = null;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function hueToColor(h: number): string {
  return `hsl(${h} 80% 45%)`;
}

function updateColorSliderUI() {
  const color = hueToColor(markerHue);
  hueInput.style.setProperty("--pick-color", color);
}

updateColorSliderUI();

/* ---------- Custom ---------- */
customBtn.addEventListener("click", () => {
  const text = prompt("Custom sticker text (emoji/text)", "🧽");
  if (text == null || text.trim() === "") return;
  STICKERS.push({ glyph: text, size: DEFAULT_STICKER_SIZE });
  selectStickerByIndex(STICKERS.length - 1);
});

/* ---------- Redraw ---------- */
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const cmd of displayList) cmd.display(ctx);
  if (currentPreview) currentPreview.display(ctx);
}

function exportHighResPNG() {
  const srcW = canvas.width;
  const srcH = canvas.height;
  const SCALE = 4;

  const out = document.createElement("canvas");
  out.width = srcW * SCALE;
  out.height = srcH * SCALE;

  const octx = out.getContext("2d")!;
  octx.save();
  octx.scale(SCALE, SCALE);
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width / SCALE, out.height / SCALE);

  for (const cmd of displayList) {
    cmd.display(octx);
  }

  octx.restore();
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `sketchpad-${srcW * SCALE}x${srcH * SCALE}-${ts}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

/* ---------- Stroke lifecycle ---------- */
function beginStroke(ev: PointerEvent) {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  isDrawing = true;
  currentPreview = null;
  redoStack.length = 0;

  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    activeCommand = createMarkerLine(
      p,
      selectedLineWidth,
      hueToColor(markerHue),
    );
  } else {
    if (selectedStickerIdx == null) return;
    const s = STICKERS[selectedStickerIdx];
    activeCommand = createPlaceSticker(p, s.glyph, s.size, stickerRotationDeg);
  }

  displayList.push(activeCommand);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function drawStroke(ev: PointerEvent) {
  if (!isDrawing || !activeCommand) return;
  const p = posFromPointer(ev);
  if ("drag" in activeCommand && typeof activeCommand.drag === "function") {
    activeCommand.drag(p);
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function endStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  isDrawing = false;
  (ev.target as Element).releasePointerCapture?.(ev.pointerId);

  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    currentPreview = createToolPreviewPen(
      p,
      selectedLineWidth,
      hueToColor(markerHue),
    );
  } else if (selectedStickerIdx != null) {
    const s = STICKERS[selectedStickerIdx];
    currentPreview = createStickerPreview(
      p,
      s.glyph,
      s.size,
      stickerRotationDeg,
    );
  }

  activeCommand = null;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

canvas.addEventListener("pointermove", (ev) => {
  if (isDrawing) return;
  const p = posFromPointer(ev);

  if (toolMode === "pen") {
    currentPreview = createToolPreviewPen(
      p,
      selectedLineWidth,
      hueToColor(markerHue),
    );
  } else if (selectedStickerIdx != null) {
    const s = STICKERS[selectedStickerIdx];
    currentPreview = createStickerPreview(
      p,
      s.glyph,
      s.size,
      stickerRotationDeg,
    );
  } else {
    currentPreview = null;
  }

  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

/* ---------- Tool switching ---------- */
function setActiveTool(width: number) {
  toolMode = "pen";
  selectedLineWidth = width;
  thinBtn.classList.toggle("selected", width === THIN_WIDTH);
  thickBtn.classList.toggle("selected", width === THICK_WIDTH);
  thinBtn.setAttribute("aria-pressed", String(width === THIN_WIDTH));
  thickBtn.setAttribute("aria-pressed", String(width === THICK_WIDTH));
  selectedStickerIdx = null;
  renderStickerButtons();
}

/* ---------- Clear / Undo / Redo ---------- */
clearBtn.addEventListener("click", () => {
  displayList.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

undoBtn.addEventListener("click", () => {
  if (displayList.length === 0) return;
  const popped = displayList.pop()!;
  redoStack.push(popped);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

redoBtn.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  const popped = redoStack.pop()!;
  displayList.push(popped);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

/* ---------- Event wiring ---------- */
renderStickerButtons();
setActiveTool(THIN_WIDTH);
canvas.addEventListener("drawing-changed", redraw);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", drawStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerout", () => {
  currentPreview = null;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});
thinBtn.addEventListener("click", () => setActiveTool(THIN_WIDTH));
thickBtn.addEventListener("click", () => setActiveTool(THICK_WIDTH));
exportBtn.addEventListener("click", exportHighResPNG);
