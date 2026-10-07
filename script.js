const display = document.getElementById("display");
let expr = "";
let justEvaluated = false;

function render(fallback = "0") {
  display.value = expr || fallback;
}

function input(key) {
  if (key === "C") {
    expr = "";
    justEvaluated = false;
  } else if (key === "⌫") {
    expr = expr.slice(0, -1);
    justEvaluated = false;
  } else if (key === "=") {
    evaluate();
    return;
  } else {
    if (justEvaluated && /[0-9.]/.test(key)) expr = "";
    justEvaluated = false;
    expr += key;
  }
  render();
}

function evaluate() {
  if (!expr) return;
  try {
    // Only allow safe calculator characters
    if (!/^[0-9+\-*/.%\s()]+$/.test(expr)) throw new Error("bad input");
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== "number" || !isFinite(result)) throw new Error("bad result");
    expr = String(Math.round(result * 1e10) / 1e10);
    justEvaluated = true;
  } catch {
    expr = "";
    display.value = "Error";
    justEvaluated = true;
    return;
  }
  render();
}

document.querySelectorAll("button[data-key]").forEach((btn) => {
  btn.addEventListener("click", () => input(btn.dataset.key));
});

document.addEventListener("keydown", (e) => {
  const map = { Enter: "=", Backspace: "⌫", Escape: "C", x: "*", X: "*" };
  const key = map[e.key] ?? e.key;
  if (/^[0-9+\-*/.%(=]$/.test(key) || ["C", "⌫"].includes(key)) {
    e.preventDefault();
    input(key);
  }
});

render();
