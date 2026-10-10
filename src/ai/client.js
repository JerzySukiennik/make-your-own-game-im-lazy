/* Calls to the Worker API. */
import { CFG } from "../config.js";

export async function api(stage, payload) {
  let r;
  try {
    r = await fetch(`${CFG.api}/api/${stage}`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
  } catch (e) {
    throw Object.assign(new Error("Cannot reach the AI server. Check your connection."), { code: "net" });
  }
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok || j.error) throw Object.assign(new Error(j.error || "AI error " + r.status), { code: j.code || "http" });
  return j;
}

function headers() {
  const h = { "content-type": "application/json" };
  const p = getPass();
  if (p) h["x-myog-pass"] = p;
  return h;
}

export function getPass() { try { return localStorage.getItem("myog.pass") || ""; } catch (e) { return ""; } }
export function setPass(v) { try { if (v) localStorage.setItem("myog.pass", v); else localStorage.removeItem("myog.pass"); } catch (e) {} }

export async function health() {
  try { const r = await fetch(`${CFG.api}/api/health`, { headers: headers() }); return await r.json(); } catch (e) { return null; }
}

/* Returns true when the server accepts the code; stores it only then. */
export async function unlock(code) {
  try {
    const r = await fetch(`${CFG.api}/api/unlock`, { method: "POST", headers: { "content-type": "application/json", "x-myog-pass": code } });
    const j = await r.json().catch(() => ({}));
    if (j.ok) { setPass(code); return { ok: true }; }
    return { ok: false, error: j.error || "Wrong code." };
  } catch (e) { return { ok: false, error: "Cannot reach the server." }; }
}
