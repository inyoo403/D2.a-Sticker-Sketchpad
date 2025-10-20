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

/* Bottom: 🍎 🍌 🥝 */
const appleBtn = el("button", { className: "btn", text: "🍎" });
const bananaBtn = el("button", { className: "btn", text: "🍌" });
const kiwiBtn = el("button", { className: "btn", text: "🥝" });
toolbarBottom.appendChild(appleBtn);
toolbarBottom.appendChild(bananaBtn);
toolbarBottom.appendChild(kiwiBtn);

/* Canvas */
const canvas = el("canvas", {
  className: "sketch",
  attrs: { width: "256", height: "256" },
});
app.appendChild(canvas);

const ctx = canvas.getContext("2d")!;

/* ---------- State ---------- */
interface Point {
  x: number;
  y: number;
}

interface Displayable {
  display(ctx: CanvasRenderingContext2D): void;
}

class ToolPreview implements Displayable {
  constructor(private center: Point, private width: number) {}
  display(ctx: CanvasRenderingContext2D): void {
    const r = Math.max(1, this.width / 2);
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#0b57d0cc";
    ctx.fillStyle = "#ffffff99";
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

class StickerPreview implements Displayable {
  constructor(
    private center: Point,
    private emoji: string,
    private size: number,
  ) {}
  display(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font =
      `${this.size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.9;
    ctx.fillText(this.emoji, this.center.x, this.center.y);
    ctx.restore();
  }
}

class PlaceSticker implements Displayable {
  constructor(
    private center: Point,
    private emoji: string,
    private size: number,
  ) {}
  drag(p: Point) {
    this.center = p;
  }
  display(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font =
      `${this.size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.emoji, this.center.x, this.center.y);
    ctx.restore();
  }
}

class MarkerLine implements Displayable {
  private points: Point[] = [];

  constructor(initial: Point, private width: number) {
    this.points.push(initial);
  }

  drag(p: Point) {
    this.points.push(p);
  }

  display(ctx: CanvasRenderingContext2D): void {
    if (this.points.length < 2) return;
    ctx.save();
    ctx.lineWidth = this.width;
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      const pt = this.points[i];
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

let displayList: Displayable[] = [];
let redoStack: Displayable[] = [];
let isDrawing = false;
type ToolMode = "pen" | "sticker";
let toolMode: ToolMode = "pen";
let selectedStickerEmoji: string | null = null;
const selectedStickerSize = 28;
let activeSticker: PlaceSticker | null = null;
let activeLine: MarkerLine | null = null;
let currentPreview: Displayable | null = null;
let selectedLineWidth = 2;

/* ---------- Functions ---------- */
function posFromPointer(ev: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0b57d0";

  for (const cmd of displayList) {
    cmd.display(ctx);
  }

  if (currentPreview) {
    currentPreview.display(ctx);
  }
}

function beginStroke(ev: PointerEvent) {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  currentPreview = null;
  isDrawing = true;
  redoStack = [];
  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    currentPreview = null;
    activeLine = new MarkerLine(p, selectedLineWidth);
    displayList.push(activeLine);
  } else {
    if (!selectedStickerEmoji) return;
    activeSticker = new PlaceSticker(
      p,
      selectedStickerEmoji,
      selectedStickerSize,
    );
    displayList.push(activeSticker);
    currentPreview = null;
  }
}

function drawStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    if (!activeLine) return;
    activeLine.drag(p);
  } else {
    if (!activeSticker) return;
    activeSticker.drag(p);
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function endStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  isDrawing = false;
  (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  activeLine = null;
  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    activeLine = null;
    currentPreview = new ToolPreview(p, selectedLineWidth);
  } else {
    activeSticker = null;
    if (selectedStickerEmoji) {
      currentPreview = new StickerPreview(
        p,
        selectedStickerEmoji,
        selectedStickerSize,
      );
    }
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function setActiveTool(width: number) {
  toolMode = "pen";
  selectedLineWidth = width;
  thinBtn.classList.toggle("selected", width === 2);
  thickBtn.classList.toggle("selected", width === 6);
  thinBtn.setAttribute("aria-pressed", String(width === 2));
  thickBtn.setAttribute("aria-pressed", String(width === 6));

  selectedStickerEmoji = null;
  for (const b of [appleBtn, bananaBtn, kiwiBtn]) {
    b.classList.remove("selected");
    b.removeAttribute("aria-pressed");
  }

  if (!isDrawing && currentPreview) {
    const rect = canvas.getBoundingClientRect();
    const cx = Math.min(Math.max(0, rect.width / 2), canvas.width);
    const cy = Math.min(Math.max(0, rect.height / 2), canvas.height);
    currentPreview = new ToolPreview({ x: cx, y: cy }, selectedLineWidth);
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  }
}

function selectSticker(emojiBtn: HTMLButtonElement, emoji: string) {
  toolMode = "sticker";
  selectedStickerEmoji = emoji;

  for (const b of [thinBtn, thickBtn]) {
    b.classList.remove("selected");
    b.removeAttribute("aria-pressed");
  }
  for (const b of [appleBtn, bananaBtn, kiwiBtn]) {
    const on = b === emojiBtn;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", String(on));
  }
}

appleBtn.addEventListener("click", () => selectSticker(appleBtn, "🍎"));
bananaBtn.addEventListener("click", () => selectSticker(bananaBtn, "🍌"));
kiwiBtn.addEventListener("click", () => selectSticker(kiwiBtn, "🥝"));

canvas.addEventListener("drawing-changed", redraw);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", drawStroke);

canvas.addEventListener("pointermove", (ev) => {
  if (isDrawing) return;
  const p = posFromPointer(ev);
  if (toolMode === "pen") {
    currentPreview = new ToolPreview(p, selectedLineWidth);
  } else if (selectedStickerEmoji) {
    currentPreview = new StickerPreview(
      p,
      selectedStickerEmoji,
      selectedStickerSize,
    );
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);

canvas.addEventListener("pointerout", () => {
  currentPreview = null;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

canvas.addEventListener("pointercancel", endStroke);

/* ---------- ClearBtn ---------- */
clearBtn.addEventListener("click", () => {
  displayList = [];
  redoStack = [];
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

/* ---------- Redo/Undo ---------- */
undoBtn.addEventListener("click", () => {
  if (displayList.length === 0) return;
  const lastStroke = displayList.pop()!;
  redoStack.push(lastStroke);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

redoBtn.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  const lastUndoneStroke = redoStack.pop()!;
  displayList.push(lastUndoneStroke);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});

thinBtn.addEventListener("click", () => setActiveTool(2));
thickBtn.addEventListener("click", () => setActiveTool(6));

setActiveTool(2);
