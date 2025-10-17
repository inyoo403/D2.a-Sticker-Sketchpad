import "./style.css";

/* ---------- DOM ---------- */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string; attrs?: Record<string, string> },
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts?.className) node.className = opts.className;
  if (opts?.text) node.textContent = opts.text;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  return node;
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

/* ---------- Drawing ---------- */
let drawing = false;
let lastX = 0;
let lastY = 0;

function pos(ev: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

canvas.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  const p = pos(ev);
  drawing = true;
  lastX = p.x;
  lastY = p.y;
});

canvas.addEventListener("pointermove", (ev) => {
  if (!drawing) return;
  const p = pos(ev);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0b57d0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  lastX = p.x;
  lastY = p.y;
});

canvas.addEventListener("pointerup", () => (drawing = false));
canvas.addEventListener("pointerleave", () => (drawing = false));
canvas.addEventListener("pointercancel", () => (drawing = false));

/* ---------- Clear ---------- */
clearBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
