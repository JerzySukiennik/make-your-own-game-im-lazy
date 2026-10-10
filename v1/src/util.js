/* Small DOM and misc helpers. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") { for (const sk in v) { if (sk.startsWith("--")) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export function fill(el, ...kids) { el.replaceChildren(...kids.flat(9).filter((c) => c != null && c !== false).map((c) => (c.nodeType ? c : document.createTextNode(String(c))))); return el; }
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
export function uid(n = 8) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(n));
  for (const x of r) s += a[x % a.length];
  return s;
}
export function roomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(4));
  for (const x of r) s += a[x % a.length];
  return s;
}
export function slug(s) {
  s = String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (s || "asset").slice(0, 28);
}
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
export function ls(k, v) {
  try { if (v === undefined) return JSON.parse(localStorage.getItem("myog." + k)); localStorage.setItem("myog." + k, JSON.stringify(v)); } catch (e) { return null; }
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function throttle(fn, ms) { let last = 0, t; return (...a) => { const n = performance.now(); clearTimeout(t); if (n - last >= ms) { last = n; fn(...a); } else t = setTimeout(() => { last = performance.now(); fn(...a); }, ms - (n - last)); }; }
export function toast(msg, ms = 2600) {
  const t = h("div", { class: "toast" }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}
export function textColor(bg) {
  const c = bg.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#000" : "#fff";
}
export function bytes(s) { return new Blob([s]).size; }
