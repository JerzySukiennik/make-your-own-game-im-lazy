/* Calls to the Worker API. */
import { CFG } from "../config.js";

export async function api(stage, payload) {
  let r;
  try {
    r = await fetch(`${CFG.api}/api/${stage}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    throw Object.assign(new Error("Cannot reach the AI server. Check your connection."), { code: "net" });
  }
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok || j.error) throw Object.assign(new Error(j.error || "AI error " + r.status), { code: j.code || "http" });
  return j;
}

export async function health() {
  try { const r = await fetch(`${CFG.api}/api/health`); return await r.json(); } catch (e) { return null; }
}
