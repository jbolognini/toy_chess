const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const piece = { x: 3, y: 3, dragging: false };

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const size = Math.min(canvas.width, canvas.height) * 0.9;
  const square = size / 8;
  const ox = (canvas.width - size) / 2;
  const oy = (canvas.height - size) / 2;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#ddd" : "#666";
      ctx.fillRect(ox + c * square, oy + r * square, square, square);
    }
  }

  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(
    ox + (piece.x + 0.5) * square,
    oy + (piece.y + 0.5) * square,
    square * 0.3,
    0,
    Math.PI * 2
  );
  ctx.fill();

  requestAnimationFrame(draw);
}
draw();

canvas.addEventListener("pointerdown", e => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const size = Math.min(canvas.width, canvas.height) * 0.9;
  const square = size / 8;
  const ox = (canvas.width - size) / 2;
  const oy = (canvas.height - size) / 2;

  const c = Math.floor((px - ox) / square);
  const r = Math.floor((py - oy) / square);

  if (c === piece.x && r === piece.y) {
    piece.dragging = true;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener("pointermove", e => {
  if (!piece.dragging) return;

  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const size = Math.min(canvas.width, canvas.height) * 0.9;
  const square = size / 8;
  const ox = (canvas.width - size) / 2;
  const oy = (canvas.height - size) / 2;

  piece.x = Math.max(0, Math.min(7, Math.floor((px - ox) / square)));
  piece.y = Math.max(0, Math.min(7, Math.floor((py - oy) / square)));
});

canvas.addEventListener("pointerup", e => {
  piece.dragging = false;
  canvas.releasePointerCapture(e.pointerId);
});
