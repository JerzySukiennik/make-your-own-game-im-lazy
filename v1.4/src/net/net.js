/* Realtime layer: one interface, two backends (Firebase RTDB, and a local in-memory tree synced across tabs). */
import { CFG } from "../config.js";

function split(path) { return String(path).split("/").filter(Boolean); }
function getAt(tree, parts) {
  let n = tree;
  for (const p of parts) { if (n == null || typeof n !== "object") return null; n = n[p]; }
  return n === undefined ? null : n;
}
function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
function prune(v) {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) { prune(v[k]); if (v[k] == null || (typeof v[k] === "object" && !Object.keys(v[k]).length)) delete v[k]; }
  }
  return v;
}
let keyCounter = 0;
function localKey() { return Date.now().toString(36).padStart(9, "0") + (keyCounter++ % 1296).toString(36).padStart(2, "0") + Math.random().toString(36).slice(2, 5); }

/* ---------- local backend ---------- */
function makeLocal(shared) {
  let tree = {};
  const listeners = [];
  const bc = shared && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("myog-local") : null;
  const myId = Math.random().toString(36).slice(2);
  const disc = [];

  function applySet(path, value) {
    const parts = split(path);
    if (!parts.length) { tree = value || {}; return; }
    let n = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (n[parts[i]] == null || typeof n[parts[i]] !== "object") n[parts[i]] = {};
      n = n[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value == null) delete n[last]; else n[last] = value;
    prune(tree);
  }
  function fire() {
    for (const l of listeners.slice()) {
      const cur = getAt(tree, l.parts);
      const json = cur == null ? "null" : JSON.stringify(cur);
      if (l.ev === "value") {
        if (json !== l.prev) { l.prev = json; try { l.cb(clone(cur)); } catch (e) { console.error(e); } }
        continue;
      }
      const prevKids = l.prevKids || {};
      const kids = {};
      if (cur && typeof cur === "object") for (const k of Object.keys(cur)) kids[k] = JSON.stringify(cur[k]);
      const events = [];
      for (const k of Object.keys(kids)) {
        if (!(k in prevKids)) events.push(["child_added", k]);
        else if (prevKids[k] !== kids[k]) events.push(["child_changed", k]);
      }
      for (const k of Object.keys(prevKids)) if (!(k in kids)) events.push(["child_removed", k, prevKids[k]]);
      l.prevKids = kids;
      for (const [ev, k, old] of events) {
        if (ev !== l.ev) continue;
        try { l.cb(ev === "child_removed" ? JSON.parse(old) : clone(cur[k]), k); } catch (e) { console.error(e); }
      }
    }
  }
  function broadcast(path, value) { if (bc) bc.postMessage({ from: myId, path, value }); }
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.from === myId) return;
      if (m.hello) { bc.postMessage({ from: myId, snapshot: tree, to: m.from }); return; }
      if (m.snapshot) { if (m.to === myId && !Object.keys(tree).length) { tree = m.snapshot; fire(); } return; }
      applySet(m.path, m.value);
      fire();
    };
    bc.postMessage({ from: myId, hello: true });
    window.addEventListener("beforeunload", () => { for (const p of disc) { applySet(p, null); broadcast(p, null); } });
  }
  const B = {
    kind: "local",
    now: () => Date.now(),
    newKey: localKey,
    async set(path, v) { applySet(path, clone(v)); broadcast(path, clone(v)); fire(); },
    async update(path, obj) {
      for (const k of Object.keys(obj)) { const p = path + "/" + k; applySet(p, clone(obj[k])); broadcast(p, clone(obj[k])); }
      fire();
    },
    async push(path, v) { const k = localKey(); await B.set(path + "/" + k, v); return k; },
    async remove(path) { await B.set(path, null); },
    async get(path) { return clone(getAt(tree, split(path))); },
    on(path, ev, cb) {
      const l = { parts: split(path), ev, cb, prev: null, prevKids: null };
      const cur = getAt(tree, l.parts);
      if (ev === "value") { l.prev = cur == null ? "null" : JSON.stringify(cur); }
      else { l.prevKids = {}; }
      listeners.push(l);
      setTimeout(() => {
        if (!listeners.includes(l)) return;
        if (ev === "value") { l.prev = null; fire(); if (l.prev === null) { l.prev = "null"; try { cb(null); } catch (e) {} } }
        else fire();
      }, 0);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
    async transaction(path, fn) {
      const cur = clone(getAt(tree, split(path)));
      const nv = fn(cur);
      if (nv === undefined) return { committed: false, value: cur };
      await B.set(path, nv);
      return { committed: true, value: nv };
    },
    onDisconnectRemove(path) { disc.push(path); }
  };
  return B;
}

/* ---------- firebase backend ---------- */
async function makeFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${CFG.sdkVersion}/`;
  const [A, D] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-database.js")]);
  const app = A.initializeApp(CFG.firebase);
  const db = D.getDatabase(app);
  let offset = 0;
  D.onValue(D.ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  const R = (p) => D.ref(db, p);
  return {
    kind: "firebase",
    now: () => Date.now() + offset,
    newKey: () => D.push(R("_k")).key,
    set: (p, v) => D.set(R(p), v),
    update: (p, o) => D.update(R(p), o),
    push: async (p, v) => { const r = D.push(R(p)); await D.set(r, v); return r.key; },
    remove: (p) => D.remove(R(p)),
    get: async (p) => (await D.get(R(p))).val(),
    on(p, ev, cb) {
      const r = R(p);
      if (ev === "value") return D.onValue(r, (s) => cb(s.val()));
      const fn = { child_added: D.onChildAdded, child_changed: D.onChildChanged, child_removed: D.onChildRemoved }[ev];
      return fn(r, (s) => cb(s.val(), s.key));
    },
    async transaction(p, fn) {
      const res = await D.runTransaction(R(p), (cur) => { const nv = fn(cur); return nv === undefined ? undefined : nv; });
      return { committed: res.committed, value: res.snapshot.val() };
    },
    onDisconnectRemove(p) { D.onDisconnect(R(p)).remove(); }
  };
}

/* ---------- public API ---------- */
let fb = null, loc = null;
export const Net = {
  async firebase() { if (!fb) fb = await makeFirebase(); return fb; },
  local() { if (!loc) loc = makeLocal(true); return loc; },
  isolated() { return makeLocal(false); },
  /* Wait up to ms for Firebase; on failure the caller decides what to do. */
  async tryFirebase(ms = 6000) {
    try { return await Promise.race([Net.firebase(), new Promise((_, rej) => setTimeout(() => rej(new Error("firebase timeout")), ms))]); }
    catch (e) { console.warn("firebase unavailable", e); return null; }
  }
};
