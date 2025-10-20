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

const toolbar = el("div", { className: "toolbar" });
app.appendChild(toolbar);

const clearBtn = el("button", { className: "btn", text: "Clear" });
toolbar.appendChild(clearBtn);

const undoBtn = el("button", { className: "btn", text: "Undo" });
toolbar.appendChild(undoBtn);

const redoBtn = el("button", { className: "btn", text: "Redo" });
toolbar.appendChild(redoBtn);

const thinBtn = el("button", { className: "btn", text: "Thin" });
toolbar.appendChild(thinBtn);

const thickBtn = el("button", { className: "btn", text: "Thick" });
toolbar.appendChild(thickBtn);

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
let activeLine: MarkerLine | null = null;
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
}

function beginStroke(ev: PointerEvent) {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  isDrawing = true;
  redoStack = [];
  const p = posFromPointer(ev);
  activeLine = new MarkerLine(p, selectedLineWidth);
  displayList.push(activeLine);
}

function drawStroke(ev: PointerEvent) {
  if (!isDrawing || !activeLine) return;
  const p = posFromPointer(ev);
  activeLine.drag(p);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function endStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  isDrawing = false;
  (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  activeLine = null;
  console.log("Line finished. Total commands:", displayList.length);
}

function setActiveTool(width: number) {
  selectedLineWidth = width;
  thinBtn.classList.toggle("selected", width === 2);
  thickBtn.classList.toggle("selected", width === 6);
}

canvas.addEventListener("drawing-changed", redraw);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", drawStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
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
