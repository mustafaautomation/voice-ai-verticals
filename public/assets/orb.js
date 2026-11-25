const stage = document.getElementById("console");
const orb = document.getElementById("orb");

function syncLevel() {
  if (!stage || !orb) return;
  const raw = Number(stage.dataset.level || "0");
  const level = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  orb.style.setProperty("--level", String(level));
}

if (stage && orb) {
  syncLevel();
  const observer = new MutationObserver(syncLevel);
  observer.observe(stage, { attributes: true, attributeFilter: ["data-level", "data-state"] });
}

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("is-hidden", document.hidden);
});
