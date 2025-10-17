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
let strokeList: Point[][] = [];
let isDrawing = false;

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
  ctx.lineWidth = 2;

  for (const stroke of strokeList) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
}

function beginStroke(ev: PointerEvent) {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  isDrawing = true;
  const newStroke: Point[] = [];
  strokeList.push(newStroke);
  const p = posFromPointer(ev);
  newStroke.push(p);
}

function drawStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  const p = posFromPointer(ev);
  const currentStroke = strokeList[strokeList.length - 1];
  currentStroke.push(p);
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
}

function endStroke(ev: PointerEvent) {
  if (!isDrawing) return;
  isDrawing = false;
  (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  console.log("Line finished. Total lines:", strokeList.length);
  console.log("Current data:", strokeList);
}

canvas.addEventListener("drawing-changed", redraw);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", drawStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
canvas.addEventListener("pointercancel", endStroke);

/* ---------- ClearBtn ---------- */
clearBtn.addEventListener("click", () => {
  strokeList = [];
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
});
