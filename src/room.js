/* Room controller: everything one room shares (players, prompt, assets, strokes, phase, review, build, game). */
import { CFG, COLORS } from "./config.js";
import { RGA } from "./doc/rga.js";
import { roomCode } from "./util.js";

const MAXS = 60000;

export class Room {
  constructor(backend, code, me, opts) {
    this.b = backend;
    this.code = code;
    this.me = me;
    this.opts = opts || {};
    this.p = "rooms/" + code;
    this.meta = null;
    this.players = {};
    this.assets = {};
    this.strokes = {};
    this.live = {};
    this.review = {};
    this.answers = {};
    this.build = null;
    this.game = null;
    this.doc = new RGA(me.id);
    this.cursors = {};
    this.unsubs = [];
    this.evs = {};
    this.closed = false;
    this.assetSubs = {};
    this._bbTimers = {};
  }

  on(ev, fn) { (this.evs[ev] = this.evs[ev] || []).push(fn); return () => { this.evs[ev] = this.evs[ev].filter((f) => f !== fn); }; }
  emit(ev, d) { (this.evs[ev] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

  /* ---------- lifecycle ---------- */

  static async create(backend, me, o) {
    for (let i = 0; i < 12; i++) {
      const code = o.solo ? "SOLO" + Math.random().toString(36).slice(2, 5).toUpperCase() : roomCode();
      const r = await backend.transaction(`rooms/${code}/meta`, (cur) => {
        if (cur) return undefined;
        return { created: backend.now(), pub: !!o.pub, name: o.name || "", phase: "draw", round: 1, ai: false, solo: !!o.solo, gen: 0 };
      });
      if (r.committed) return code;
    }
    throw new Error("Could not allocate a room code");
  }

  async join() {
    const meta = await this.b.get(this.p + "/meta");
    if (!meta) throw new Error("Room not found");
    if (await this.b.get(`${this.p}/kicked/${this.me.id}`)) throw new Error("The host removed you from this room");
    const pl = (await this.b.get(this.p + "/players")) || {};
    const now = this.b.now();
    const live = Object.entries(pl).filter(([id, v]) => id !== this.me.id && now - (v.ping || 0) < 40000);
    if (live.length >= CFG.maxPlayers) throw new Error("Room is full");
    const used = new Set(live.map(([, v]) => v.color));
    const color = this.me.color && !used.has(this.me.color) ? this.me.color : (COLORS.find((c) => !used.has(c)) || COLORS[0]);
    this.me.color = color;
    const rec = { name: this.me.name, color, joined: pl[this.me.id] ? pl[this.me.id].joined : now, ready: false, ping: now };
    this.rec = rec;
    this._t0 = Date.now();
    await this.b.set(`${this.p}/players/${this.me.id}`, rec);
    this.b.onDisconnectRemove(`${this.p}/players/${this.me.id}`);
    this._listen();
    this._hb = setInterval(() => this._beat(), 8000);
    return this;
  }

  async _rejoin() {
    if (this._rejoining || this.closed) return;
    this._rejoining = true;
    try {
      if (await this.b.get(`${this.p}/kicked/${this.me.id}`)) { this._gotKicked(); return; }
      if (!(await this.b.get(this.p + "/meta"))) return;
      await this.b.set(`${this.p}/players/${this.me.id}`, Object.assign({}, this.rec, { ready: false, ping: this.b.now() }));
      this.b.onDisconnectRemove(`${this.p}/players/${this.me.id}`);
    } finally { this._rejoining = false; }
  }

  _gotKicked() {
    if (this.kicked) return;
    this.kicked = true;
    this.closed = true;
    clearInterval(this._hb);
    this.emit("kicked");
  }

  _beat() {
    if (this.closed) return;
    if (!this.players[this.me.id]) {
      if (Date.now() - this._t0 > 4000) this._rejoin();
    } else {
      this.b.set(`${this.p}/players/${this.me.id}/ping`, this.b.now());
    }
    if (this.isHost()) {
      this._lobby();
      const now = this.b.now();
      for (const [id, v] of Object.entries(this.players)) {
        if (id !== this.me.id && now - (v.ping || 0) > 60000) this.b.remove(`${this.p}/players/${id}`);
      }
    }
  }

  _lobby() {
    if (!this.meta || !this.meta.pub) return;
    this.b.set("lobby/" + this.code, { name: this.meta.name || "", n: this.activePlayers().length, phase: this.meta.phase, t: this.b.now(), title: (this.game && this.game.title) || "" });
  }

  async leave() {
    this.closed = true;
    this._leaving = true;
    clearInterval(this._hb);
    this.unsubs.forEach((u) => { try { u(); } catch (e) {} });
    Object.values(this.assetSubs).forEach((a) => a.forEach((u) => { try { u(); } catch (e) {} }));
    try {
      await this.b.remove(`${this.p}/players/${this.me.id}`);
      const pl = (await this.b.get(this.p + "/players")) || {};
      if (!Object.keys(pl).length) {
        await this.b.remove(this.p);
        await this.b.remove("lobby/" + this.code);
      }
    } catch (e) {}
  }

  _listen() {
    const b = this.b, p = this.p, un = this.unsubs;
    un.push(b.on(p + "/meta", "value", (v) => {
      const first = !this.meta;
      const old = this.meta;
      this.meta = v;
      if (!v) { this.emit("gone"); return; }
      this.emit("meta", { meta: v, old, first });
      if (this.isHost()) this._lobby();
    }));
    un.push(b.on(p + "/players", "value", (v) => {
      this.players = v || {};
      this.emit("players");
      if (this.meta && this.isHost()) this._lobby();
    }));
    un.push(b.on(p + "/kicked/" + this.me.id, "value", (v) => { if (v) this._gotKicked(); }));
    un.push(b.on(p + "/prompt", "child_added", (op, key) => {
      if (this.doc.apply(op, key)) this.emit("prompt", { remote: op.by !== this.me.id });
    }));
    un.push(b.on(p + "/assets", "child_added", (v, id) => { this._assetIn(id, v); this._subAsset(id); }));
    un.push(b.on(p + "/assets", "child_changed", (v, id) => this._assetIn(id, v)));
    un.push(b.on(p + "/assets", "child_removed", (v, id) => {
      delete this.assets[id]; delete this.strokes[id]; delete this.live[id];
      (this.assetSubs[id] || []).forEach((u) => u()); delete this.assetSubs[id];
      this.emit("assets", { id, removed: true });
    }));
    un.push(b.on(p + "/review", "value", (v) => { this.review = v || {}; this.emit("review"); }));
    un.push(b.on(p + "/ans", "value", (v) => { this.answers = v || {}; this.emit("answers"); }));
    un.push(b.on(p + "/build", "value", (v) => { this.build = v; this.emit("build"); }));
    un.push(b.on(p + "/game", "value", (v) => { this.game = v; this.emit("game"); }));
  }

  _subAsset(id) {
    if (this.assetSubs[id]) return;
    const b = this.b, base = `${this.p}/strokes/${id}`;
    this.strokes[id] = this.strokes[id] || {};
    const put = (v, sid) => {
      try { const o = JSON.parse(v.d); o.id = sid; o.a = v.a; this.strokes[id][sid] = o; } catch (e) {}
      this._touch(id, "stroke");
    };
    this.assetSubs[id] = [
      b.on(base, "child_added", put),
      b.on(base, "child_changed", put),
      b.on(base, "child_removed", (v, sid) => { delete this.strokes[id][sid]; this._touch(id, "stroke"); }),
      b.on(`${this.p}/live/${id}`, "value", (v) => { this.live[id] = v || {}; this.emit("live", { id }); })
    ];
  }

  _touch(id, why) {
    const a = this.assets[id];
    if (a) { a.strokes = null; a._rev = (a._rev || 0) + 1; }
    this.emit("assets", { id, why });
  }

  _assetIn(id, v) {
    const old = this.assets[id];
    const a = Object.assign({}, v, { id });
    try { a.bb = v.bb ? JSON.parse(v.bb) : null; } catch (e) { a.bb = null; }
    try { a.rig = v.rig ? JSON.parse(v.rig) : null; } catch (e) { a.rig = null; }
    a._rev = (old && old._rev || 0) + 1;
    a._sc = null;
    this.assets[id] = a;
    this.emit("assets", { id, why: "meta" });
  }

  /* strokes of an asset as an array (sorted by z) */
  strokesOf(id) {
    return Object.values(this.strokes[id] || {}).sort((x, y) => (x.z || 0) - (y.z || 0));
  }

  /* an Art-ready asset (cached by revision) */
  art(id) {
    const a = this.assets[id];
    if (!a) return null;
    if (!a.strokes) { a.strokes = this.strokesOf(id); a._sc = null; a._mask = null; a._pieces = null; a._px = null; }
    return a;
  }

  /* ---------- players and host ---------- */

  activePlayers() {
    const now = this.b.now();
    return Object.entries(this.players)
      .filter(([id, v]) => id === this.me.id || now - (v.ping || 0) < 45000)
      .map(([id, v]) => Object.assign({ id }, v))
      .sort((x, y) => (x.joined - y.joined) || (x.id < y.id ? -1 : 1));
  }
  hostId() { const a = this.activePlayers(); return a.length ? a[0].id : this.me.id; }
  isHost() { return this.hostId() === this.me.id; }
  playerList() { return this.activePlayers().map((p, i) => ({ id: p.id, name: p.name, color: p.color, index: i })); }
  colorOf(id) { return (this.players[id] && this.players[id].color) || "#888"; }
  nameOf(id) { return (this.players[id] && this.players[id].name) || "Someone"; }

  setReady(v) { return this.b.set(`${this.p}/players/${this.me.id}/ready`, !!v); }
  allReady() { const a = this.activePlayers(); return a.length > 0 && a.every((p) => p.ready); }
  async kick(id) { await this.b.set(`${this.p}/kicked/${id}`, true); await this.b.remove(`${this.p}/players/${id}`); }
  setMeta(patch) { return this.b.update(this.p + "/meta", patch); }

  /* ---------- prompt ---------- */

  sendPrompt(next) {
    if (next.length > CFG.maxPrompt) next = next.slice(0, CFG.maxPrompt);
    const ops = this.doc.diff(next);
    for (const op of ops) this.b.push(this.p + "/prompt", op).then((key) => { this.doc.seen.add(key); });
    return ops.length > 0;
  }
  setCursor(sel) { this.b.set(`${this.p}/players/${this.me.id}/cur`, sel); }

  /* ---------- assets ---------- */

  assetCount() { return Object.keys(this.assets).length; }

  async newAsset(kind, name) {
    if (this.assetCount() >= CFG.maxAssets) throw new Error("Asset limit reached (" + CFG.maxAssets + "). Reuse an existing one.");
    const id = this.b.newKey();
    const rec = { name: name || "Asset " + (this.assetCount() + 1), desc: "", label: "", owner: this.me.id, kind: kind || "vector", created: this.b.now(), upd: this.b.now(), done: false };
    if (kind === "pixel") rec.grid = 64;
    await this.b.set(`${this.p}/assets/${id}`, rec);
    return id;
  }
  patchAsset(id, patch) { return this.b.update(`${this.p}/assets/${id}`, Object.assign({}, patch, { upd: this.b.now() })); }
  async deleteAsset(id) {
    await this.b.remove(`${this.p}/assets/${id}`);
    await this.b.remove(`${this.p}/strokes/${id}`);
    await this.b.remove(`${this.p}/live/${id}`);
  }
  async addStroke(id, stroke) {
    const s = Object.assign({}, stroke);
    delete s.id; delete s.a;
    const d = JSON.stringify(s);
    if (d.length > MAXS) throw new Error("That stroke is too big");
    const total = this.strokeBytes(id);
    if (total + d.length > CFG.maxAssetBytes * 3) throw new Error("This asset is full. Undo something or start a new asset.");
    const key = this.b.newKey();
    this.strokes[id] = this.strokes[id] || {};
    const local = JSON.parse(d); local.id = key; local.a = this.me.id;
    this.strokes[id][key] = local;
    this._touch(id, "stroke");
    await this.b.set(`${this.p}/strokes/${id}/${key}`, { a: this.me.id, d });
    this.scheduleBounds(id);
    return key;
  }
  strokeBytes(id) { let n = 0; for (const s of Object.values(this.strokes[id] || {})) n += (s.p ? s.p.length : 0) * 5 + (s.cells ? s.cells.length : 0) * 3 + (s.polys ? JSON.stringify(s.polys).length : 0) + 40; return n; }
  async removeStroke(id, sid) {
    if (this.strokes[id]) delete this.strokes[id][sid];
    this._touch(id, "stroke");
    await this.b.remove(`${this.p}/strokes/${id}/${sid}`);
    this.scheduleBounds(id);
  }
  async clearStrokes(id) {
    this.strokes[id] = {};
    this._touch(id, "stroke");
    await this.b.remove(`${this.p}/strokes/${id}`);
    this.scheduleBounds(id);
  }
  setLive(id, d) { return d ? this.b.set(`${this.p}/live/${id}/${this.me.id}`, { d: JSON.stringify(d) }) : this.b.remove(`${this.p}/live/${id}/${this.me.id}`); }

  /* debounced recompute of the tight bounding box; whoever drew last writes it */
  scheduleBounds(id) {
    clearTimeout(this._bbTimers[id]);
    this._bbTimers[id] = setTimeout(() => {
      const a = this.art(id);
      if (!a) return;
      Art.invalidate(a);
      a.strokes = this.strokesOf(id);
      const bb = (a.kind === "vector" || a.kind === "pixel") ? (a.strokes.length ? Art.tightBounds(a) : null) : a.bb;
      this.patchAsset(id, { bb: bb ? JSON.stringify(bb.map((x) => +x.toFixed(1))) : null });
    }, 500);
  }

  /* authors of an asset (anyone with a stroke on it, plus the owner) */
  authorsOf(id) {
    const set = new Set();
    const a = this.assets[id];
    if (a && a.owner) set.add(a.owner);
    for (const s of Object.values(this.strokes[id] || {})) if (s.a) set.add(s.a);
    return Array.from(set);
  }

  /* ---------- phases ---------- */

  async setPhase(phase, extra) { await this.setMeta(Object.assign({ phase }, extra || {})); }
  async resetReady() {
    const up = {};
    for (const id of Object.keys(this.players)) up[id + "/ready"] = false;
    await this.b.update(this.p + "/players", up);
  }
}
