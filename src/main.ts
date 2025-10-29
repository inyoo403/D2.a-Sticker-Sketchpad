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
toolbarTop.appendChild(clearBtn);
toolbarTop.appendChild(undoBtn);
toolbarTop.appendChild(redoBtn);

/* Mid: Thin / Thick */
const thinBtn = el("button", { className: "btn", text: "Thin" });
const thickBtn = el("button", { className: "btn", text: "Thick" });
toolbarMid.appendChild(thinBtn);
toolbarMid.appendChild(thickBtn);

/* Bottom: Stickers (data-driven) + Custom */
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

/* ---------- State ---------- */
type Point = { x: number; y: number };

function posFromPointer(ev: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

interface Displayable {
  display(ctx: CanvasRenderingContext2D): void;
}

function createMarkerLine(initial: Point, width: number) {
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
      ctx.strokeStyle = "#0b57d0";
      if (pts.length < 2) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
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

function createToolPreviewPen(center: Point, width: number): Displayable {
  return {
    display(ctx) {
      const r = Math.max(1, width / 2);
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#0b57d0cc";
      ctx.fillStyle = "#ffffff99";
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
): Displayable {
  return {
    display(ctx) {
      ctx.save();
      ctx.font =
        `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.9;
      ctx.fillText(emoji, center.x, center.y);
      ctx.restore();
    },
  };
}

function createPlaceSticker(initial: Point, emoji: string, size: number) {
  let at = { ...initial };
  const obj: Displayable & { drag: (p: Point) => void } = {
    drag(p: Point) {
      at = { ...p };
    },
    display(ctx) {
      ctx.save();
      ctx.font =
        `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, at.x, at.y);
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
const DEFAULT_STICKER_SIZE = 28;

const STICKERS: StickerDef[] = [
  { glyph: "🍎", size: DEFAULT_STICKER_SIZE },
  { glyph: "🍌", size: DEFAULT_STICKER_SIZE },
  { glyph: "🥝", size: DEFAULT_STICKER_SIZE },
];

let selectedStickerIdx: number | null = null;

let activeCommand: (Displayable & { drag?: (p: Point) => void }) | null = null;
let currentPreview: Displayable | null = null;
let selectedLineWidth = 2;

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

/* ---------- Stroke lifecycle ---------- */
function beginStroke(ev: PointerEvent) {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  isDrawing = true;
  currentPreview = null;
  redoStack.length = 0;

  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    activeCommand = createMarkerLine(p, selectedLineWidth);
  } else {
    if (selectedStickerIdx == null) return;
    const s = STICKERS[selectedStickerIdx];
    activeCommand = createPlaceSticker(p, s.glyph, s.size);
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
    currentPreview = createToolPreviewPen(p, selectedLineWidth);
  } else if (selectedStickerIdx != null) {
    const s = STICKERS[selectedStickerIdx];
    currentPreview = createStickerPreview(p, s.glyph, s.size);
  }
  activeCommand = null;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

/* ---------- Tool switching ---------- */
function setActiveTool(width: number) {
  toolMode = "pen";
  selectedLineWidth = width;
  thinBtn.classList.toggle("selected", width === 2);
  thickBtn.classList.toggle("selected", width === 6);
  thinBtn.setAttribute("aria-pressed", String(width === 2));
  thickBtn.setAttribute("aria-pressed", String(width === 6));
  selectedStickerIdx = null;
  renderStickerButtons();
}

/* ---------- Preview on hover ---------- */
canvas.addEventListener("pointermove", (ev) => {
  if (isDrawing) return;
  const p = posFromPointer(ev);

  if (toolMode === "pen") {
    currentPreview = createToolPreviewPen(p, selectedLineWidth);
  } else if (selectedStickerIdx != null) {
    const s = STICKERS[selectedStickerIdx];
    currentPreview = createStickerPreview(p, s.glyph, s.size);
  } else {
    currentPreview = null;
  }

  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

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
setActiveTool(2);

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
thinBtn.addEventListener("click", () => setActiveTool(2));
thickBtn.addEventListener("click", () => setActiveTool(6));
