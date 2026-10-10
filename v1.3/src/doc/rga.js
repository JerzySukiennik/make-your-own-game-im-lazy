/* Replicated growable array (RGA) text CRDT. Every character has an id, a Lamport stamp and an author. */

export class RGA {
  constructor(site) {
    this.site = site;
    this.nodes = [];
    this.idx = new Map();
    this.clock = 0;
    this.n = 0;
    this.pending = [];
    this.seen = new Set();
  }

  static greater(a, b) { return a.ts > b.ts || (a.ts === b.ts && a.site > b.site); }

  visible() { return this.nodes.filter((n) => !n.dead); }
  text() { let s = ""; for (const n of this.nodes) if (!n.dead) s += n.ch; return s; }

  /* index of the full-list node, or -1 */
  _pos(id) {
    const n = this.idx.get(id);
    return n ? this.nodes.indexOf(n) : -1;
  }

  /* visible char count at or before the node with this id ("0" = start of text) */
  indexAfter(id) {
    if (id === "0" || id == null) return 0;
    const p = this._pos(id);
    if (p < 0) return null;
    let c = 0;
    for (let i = 0; i <= p; i++) if (!this.nodes[i].dead) c++;
    return c;
  }

  /* id of the visible char just before visible index i ("0" if i is 0) */
  idBefore(i) {
    if (i <= 0) return "0";
    let c = 0;
    for (const n of this.nodes) if (!n.dead && ++c === i) return n.id;
    return "0";
  }

  localInsert(i, s) {
    const after = this.idBefore(i);
    const ts = this.clock + 1;
    const id = this.site + ":" + this.n;
    const op = { k: "i", id, a: after, s, ts, by: this.site };
    this.n += s.length;
    this.apply(op);
    return op;
  }

  localDelete(i, len) {
    const ids = [];
    let c = 0;
    for (const n of this.nodes) {
      if (n.dead) continue;
      if (c >= i && c < i + len) ids.push(n.id);
      c++;
    }
    if (!ids.length) return null;
    const op = { k: "d", ids: ids.join(",") };
    this.apply(op);
    return op;
  }

  /* Apply a local or remote op. Returns true if the text changed. */
  apply(op, key) {
    if (key) { if (this.seen.has(key)) return false; }
    const ok = this._try(op);
    if (!ok) { this.pending.push(op); return false; }
    if (key) this.seen.add(key);
    let progressed = true;
    while (progressed && this.pending.length) {
      progressed = false;
      for (let i = 0; i < this.pending.length; i++) {
        if (this._try(this.pending[i])) { this.pending.splice(i, 1); progressed = true; break; }
      }
    }
    return true;
  }

  _try(op) {
    if (op.k === "i") {
      if (this.idx.has(op.id)) return true;
      let pos = 0;
      if (op.a !== "0") {
        const p = this._pos(op.a);
        if (p < 0) return false;
        pos = p + 1;
      }
      const [site, num] = [op.id.slice(0, op.id.lastIndexOf(":")), +op.id.slice(op.id.lastIndexOf(":") + 1)];
      let prev = null;
      for (let i = 0; i < op.s.length; i++) {
        const node = { id: site + ":" + (num + i), ch: op.s[i], ts: op.ts + i, site: op.by, dead: false };
        if (i > 0) pos = this._pos(prev.id) + 1;
        while (pos < this.nodes.length && RGA.greater(this.nodes[pos], node)) pos++;
        this.nodes.splice(pos, 0, node);
        this.idx.set(node.id, node);
        prev = node;
      }
      this.clock = Math.max(this.clock, op.ts + op.s.length);
      if (op.by === this.site) this.n = Math.max(this.n, num + op.s.length);
      return true;
    }
    if (op.k === "d") {
      const ids = op.ids.split(",");
      for (const id of ids) if (!this.idx.has(id)) return false;
      for (const id of ids) this.idx.get(id).dead = true;
      return true;
    }
    return true;
  }

  /* Produce ops that turn the current text into `next` (single contiguous edit). */
  diff(next) {
    const old = this.text();
    if (old === next) return [];
    let p = 0;
    const m = Math.min(old.length, next.length);
    while (p < m && old[p] === next[p]) p++;
    let s = 0;
    while (s < m - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
    const ops = [];
    const del = old.length - s - p;
    if (del > 0) { const o = this.localDelete(p, del); if (o) ops.push(o); }
    const ins = next.slice(p, next.length - s);
    if (ins) ops.push(this.localInsert(p, ins));
    return ops;
  }
}
