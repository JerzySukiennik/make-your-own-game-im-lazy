/* MYOG game SDK: runs inside the sandboxed game iframe. Global: G. Game code talks only to G. */
(function () {
  "use strict";
  const D = window.__MYOG;
  const W = 1280, H = 720, STEP = 1 / 60;
  const G = { W, H, STEP, dt: STEP, time: 0, frame: 0, title: D.title || "Game", test: D.mode === "test" };
  window.G = G;
  const post = (m) => { try { parent.postMessage(m, "*"); } catch (e) {} };
  G.assets = {};
  G.players = D.players.slice();
  G.meId = D.me;
  G.me = G.players.find((p) => p.id === D.me) || G.players[0];
  G.hostId = D.hostId;
  Object.defineProperty(G, "isHost", { get: () => G.hostId === G.meId });
  G.seed = D.seed | 0;
  const rnd = Art.rng(G.seed || 1);
  G.rand = (a, b) => (a === undefined ? rnd() : b === undefined ? rnd() * a : a + rnd() * (b - a));
  G.randInt = (a, b) => Math.floor(G.rand(a, b + 1));
  G.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  G.angle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

  /* ---------- canvas ---------- */
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  G.canvas = canvas; G.ctx = ctx;
  let cssW = 1, cssH = 1, scale = 1, offX = 0, offY = 0, dpr = 1;
  function resize() {
    dpr = G.test ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const vw = G.test ? W : (window.innerWidth || W), vh = G.test ? H : (window.innerHeight || H);
    scale = Math.min(vw / W, vh / H);
    cssW = W * scale; cssH = H * scale;
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    canvas.style.left = (vw - cssW) / 2 + "px"; canvas.style.top = (vh - cssH) / 2 + "px";
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    offX = (vw - cssW) / 2; offY = (vh - cssH) / 2;
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---------- input ---------- */
  const down = new Set(); let pendKeys = new Set(); let pressed = new Set(); let released = new Set(); let pendRel = new Set();
  const usedKeys = new Set();
  function keyName(e) {
    const k = e.key;
    if (k === " ") return "space";
    if (k.startsWith("Arrow")) return k.slice(5).toLowerCase();
    if (k === "Escape") return "esc";
    return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  }
  window.addEventListener("keydown", (e) => {
    const n = keyName(e);
    if (["left", "right", "up", "down", "space", "tab"].includes(n)) e.preventDefault();
    if (!down.has(n)) pendKeys.add(n);
    down.add(n);
  });
  window.addEventListener("keyup", (e) => { const n = keyName(e); down.delete(n); pendRel.add(n); });
  window.addEventListener("blur", () => down.clear());
  G.key = (k) => { k = k.toLowerCase(); usedKeys.add(k); return down.has(k); };
  G.keyPressed = (k) => { k = k.toLowerCase(); usedKeys.add(k); return pressed.has(k); };
  G.keyReleased = (k) => { k = k.toLowerCase(); usedKeys.add(k); return released.has(k); };
  G.dirX = () => (G.key("right") || G.key("d") ? 1 : 0) - (G.key("left") || G.key("a") ? 1 : 0);
  G.dirY = () => (G.key("down") || G.key("s") ? 1 : 0) - (G.key("up") || G.key("w") ? 1 : 0);

  const M = { x: W / 2, y: H / 2, px: W / 2, py: H / 2, down: false, right: false, pressed: false, released: false, wheel: 0 };
  G.mouse = M;
  let mDown = false, mRight = false, pendMP = false, pendMR = false, pendWheel = 0, mx = W / 2, my = H / 2;
  function setPos(e) {
    const r = canvas.getBoundingClientRect();
    mx = G.clamp(((e.clientX - r.left) / r.width) * W, 0, W);
    my = G.clamp(((e.clientY - r.top) / r.height) * H, 0, H);
  }
  window.addEventListener("pointermove", setPos);
  window.addEventListener("pointerdown", (e) => { setPos(e); if (e.button === 2) mRight = true; else { mDown = true; pendMP = true; } startAudio(); });
  window.addEventListener("pointerup", (e) => { setPos(e); if (e.button === 2) mRight = false; else { mDown = false; pendMR = true; } });
  window.addEventListener("wheel", (e) => { pendWheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.style.cursor = "none";

  function snapshotInput() {
    pressed = pendKeys; pendKeys = new Set();
    released = pendRel; pendRel = new Set();
    M.px = M.x; M.py = M.y; M.x = mx; M.y = my;
    M.down = mDown; M.right = mRight; M.pressed = pendMP; M.released = pendMR; M.wheel = pendWheel;
    pendMP = pendMR = false; pendWheel = 0;
  }

  /* ---------- assets ---------- */
  const handles = {};
  const manifest = (D.manifest && D.manifest.assets) || {};
  function sizeOf(name, a, opt) {
    opt = opt || {};
    const asp = a.aspect;
    const m = manifest[name] || {};
    const base = m.size || {};
    let w, h;
    if (opt.w && opt.h) { w = opt.w; h = opt.h; }
    else if (opt.w) { w = opt.w; h = w / asp; }
    else if (opt.h) { h = opt.h; w = h * asp; }
    else if (base.w && !base.h) { w = base.w; h = w / asp; }
    else {
      h = base.h || (asp >= 1 ? 64 / asp : 64);
      w = h * asp;
    }
    const k = opt.scale == null ? 1 : opt.scale;
    return [w * k, h * k];
  }
  function anchorOffset(anchor, w, h) {
    if (Array.isArray(anchor)) return [(0.5 - anchor[0]) * w, (0.5 - anchor[1]) * h];
    let ax = .5, ay = .5;
    const a = String(anchor || "center");
    if (a.includes("left")) ax = 0; if (a.includes("right")) ax = 1;
    if (a.includes("top")) ay = 0; if (a.includes("bottom")) ay = 1;
    return [(0.5 - ax) * w, (0.5 - ay) * h];
  }
  const stats = { draws: {}, firstVisible: {} };
  function stat(name, x, y, w, h) {
    const s = stats.draws[name] || (stats.draws[name] = { n: 0, vis: 0 });
    s.n++;
    const cx = x, cy = y;
    if (cx > -w / 2 && cx < W + w / 2 && cy > -h / 2 && cy < H + h / 2 && w >= 12 && h >= 12) {
      s.vis++;
      if (stats.firstVisible[name] == null) stats.firstVisible[name] = G.frame;
    }
  }
  const warned = new Set();
  function warn(m) { if (!warned.has(m)) { warned.add(m); post({ t: "warn", msg: m }); console.warn(m); } }
  G.has = (name) => !!handles[name];
  G.size = (name, opt) => { const a = handles[name]; if (!a) return [64, 64]; const s = sizeOf(name, a, opt); return { w: s[0], h: s[1] }; };
  G.draw = function (name, x, y, opt) {
    opt = opt || {};
    const a = handles[name];
    if (!a) {
      warn("Unknown asset: " + name);
      ctx.save(); ctx.fillStyle = "#f0f"; ctx.fillRect(x - 16, y - 16, 32, 32); ctx.restore(); return;
    }
    if (a.blank) return;
    const [w, h] = sizeOf(name, a, opt);
    const off = anchorOffset(opt.anchor, w, h);
    if (G.test) { const m = ctx.getTransform(); stat(name, x + off[0], y + off[1], w, h); }
    Art.drawAsset(ctx, a.art, x + off[0], y + off[1], w, h, { anim: opt.anim, t: opt.t == null ? G.time : opt.t, rot: opt.rot, flip: opt.flip, flipY: opt.flipY, alpha: opt.alpha });
  };
  G.box = function (name, x, y, opt) {
    opt = opt || {};
    const a = handles[name];
    if (!a) return { x: x - 16, y: y - 16, w: 32, h: 32 };
    const [w, h] = sizeOf(name, a, opt);
    const off = anchorOffset(opt.anchor, w, h);
    return { x: x + off[0] - w / 2, y: y + off[1] - h / 2, w, h };
  };
  G.hit = function (name, x, y, px, py, opt) {
    opt = opt || {};
    const a = handles[name];
    if (!a || a.blank) return false;
    const [w, h] = sizeOf(name, a, opt);
    const off = anchorOffset(opt.anchor, w, h);
    let dx = px - (x + off[0]), dy = py - (y + off[1]);
    const rot = opt.rot || 0;
    if (rot) { const c = Math.cos(-rot), s = Math.sin(-rot); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
    if (opt.flip) dx = -dx;
    if (opt.flipY) dy = -dy;
    return Art.maskHit(a.art, dx / w + .5, dy / h + .5);
  };
  G.hitSegment = function (name, x, y, ax, ay, bx, by, opt) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / 4));
    for (let i = 0; i <= n; i++) {
      if (G.hit(name, x, y, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, opt)) return true;
    }
    return false;
  };
  G.hitCircle = function (name, x, y, cx, cy, r, opt) {
    if (G.hit(name, x, y, cx, cy, opt)) return true;
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      if (G.hit(name, x, y, cx + Math.cos(an) * r, cy + Math.sin(an) * r, opt)) return true;
      if (G.hit(name, x, y, cx + Math.cos(an) * r / 2, cy + Math.sin(an) * r / 2, opt)) return true;
    }
    return false;
  };
  G.overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  G.pieces = function (name, seedOverride) {
    const a = handles[name];
    if (!a || a.blank) return [];
    const m = manifest[name] || {};
    const spec = m.slice || { mode: "shatter", n: 6 };
    const [W0, H0] = sizeOf(name, a);
    const list = Art.pieces(a.art, spec, seedOverride || a.seed);
    return list.map((p, i) => {
      const pw = p.nw * W0, ph = p.nh * H0;
      return {
        i, w: pw, h: ph, dx: (p.cx - .5) * W0, dy: (p.cy - .5) * H0,
        draw(x, y, o) {
          o = o || {};
          const k = o.scale == null ? 1 : o.scale;
          ctx.save();
          if (o.alpha != null) ctx.globalAlpha *= o.alpha;
          ctx.translate(x, y);
          if (o.rot) ctx.rotate(o.rot);
          if (o.flip) ctx.scale(-1, 1);
          ctx.imageSmoothingEnabled = a.art.kind !== "pixel";
          ctx.drawImage(p.c, -pw * k / 2, -ph * k / 2, pw * k, ph * k);
          ctx.restore();
        }
      };
    });
  };

  /* players -> avatar / cursor */
  function ownerAsset(label, p) {
    const own = Object.values(handles).filter((a) => a.label === label);
    if (!own.length) return null;
    const mine = own.find((a) => a.owner === p.id);
    if (mine) return mine.name;
    const unowned = own.filter((a) => !G.players.some((q) => q.id === a.owner));
    const pool = unowned.length ? unowned : own;
    return pool[(p.index || 0) % pool.length].name;
  }
  G.avatar = (p) => ownerAsset("avatar", p || G.me);
  G.cursor = (p) => ownerAsset("cursor", p || G.me);
  G.drawPlayer = function (p, x, y, opt) {
    const n = G.avatar(p);
    if (n) { G.draw(n, x, y, opt); return; }
    opt = opt || {};
    const r = (opt.h || 64) / 2;
    ctx.save(); ctx.fillStyle = p.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  function drawPointer(p, x, y, opt) {
    const n = G.cursor(p);
    if (n) { G.draw(n, x, y, Object.assign({ anchor: "topleft", h: 48 }, opt || {})); return; }
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = p.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 26); ctx.lineTo(7, 20); ctx.lineTo(13, 32); ctx.lineTo(18, 29); ctx.lineTo(12, 18); ctx.lineTo(21, 18); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  G.drawCursor = drawPointer;

  /* ---------- sound ---------- */
  let AC = null, master = null;
  function startAudio() {
    if (G.test || AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = .7; master.connect(AC.destination);
    } catch (e) {}
  }
  const recorded = {};
  function noise(dur, vol, hp) {
    const b = AC.createBuffer(1, Math.max(1, AC.sampleRate * dur | 0), AC.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = AC.createBufferSource(); s.buffer = b;
    const g = AC.createGain(); g.gain.value = vol;
    const f = AC.createBiquadFilter(); f.type = hp ? "highpass" : "lowpass"; f.frequency.value = hp || 1800;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function tone(type, f0, f1, dur, vol, delay) {
    const t = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  const SFX = {
    click: () => tone("square", 700, 500, .06, .15),
    blip: () => tone("square", 520, 880, .09, .15),
    select: () => { tone("square", 440, 440, .06, .12); tone("square", 660, 660, .08, .12, .06); },
    coin: () => { tone("square", 880, 880, .07, .14); tone("square", 1320, 1320, .16, .14, .07); },
    jump: () => tone("square", 280, 640, .16, .16),
    hit: () => { tone("sawtooth", 220, 70, .14, .2); noise(.1, .2, 600); },
    hurt: () => tone("sawtooth", 360, 80, .3, .2),
    explode: () => { noise(.6, .5); tone("sawtooth", 140, 30, .5, .3); },
    shoot: () => { tone("sawtooth", 900, 160, .13, .14); noise(.05, .12, 2000); },
    laser: () => tone("square", 1400, 260, .22, .12),
    pop: () => tone("sine", 600, 120, .12, .25),
    whoosh: () => noise(.28, .25, 900),
    powerup: () => { [0, 1, 2, 3].forEach((i) => tone("square", 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), .09, .13, i * .07)); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone("square", f, f, .18, .14, i * .12)); },
    lose: () => { [440, 370, 311, 220].forEach((f, i) => tone("sawtooth", f, f * .98, .22, .13, i * .14)); },
    error: () => { tone("square", 160, 160, .12, .14); tone("square", 130, 130, .16, .14, .1); },
    step: () => noise(.05, .14, 300),
    thud: () => tone("sine", 120, 40, .18, .35),
    drop: () => tone("sine", 900, 300, .14, .2)
  };
  G.sfxNames = Object.keys(SFX);
  G.sfx = function (name, opt) {
    if (G.test) return;
    startAudio();
    if (!AC) return;
    if (AC.state === "suspended") AC.resume();
    const rec = recorded[name];
    if (rec) {
      const s = AC.createBufferSource(); s.buffer = rec; s.playbackRate.value = (opt && opt.rate) || 1;
      const g = AC.createGain(); g.gain.value = (opt && opt.vol) || 1;
      s.connect(g); g.connect(master); s.start();
      return;
    }
    const f = SFX[name];
    if (f) f(); else warn("Unknown sound: " + name);
  };

  /* ---------- timers and fx ---------- */
  const timers = [];
  G.after = (sec, fn) => { timers.push({ at: G.time + sec, fn, every: 0 }); };
  G.every = (sec, fn) => { timers.push({ at: G.time + sec, fn, every: sec }); };
  const parts = [];
  G.burst = function (x, y, o) {
    o = o || {};
    const n = o.n || 18;
    for (let i = 0; i < n; i++) {
      const an = o.angle != null ? o.angle + (Math.random() - .5) * (o.spread == null ? 1 : o.spread) : Math.random() * 6.283;
      const sp = (o.speed || 240) * (.4 + Math.random() * .8);
      parts.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: o.life || .7, age: 0, size: o.size || 6, g: o.gravity == null ? 500 : o.gravity, c: Array.isArray(o.colors) ? G.pick(o.colors) : (o.color || "#fc0") });
    }
  };
  function stepParts() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += STEP; p.vy += p.g * STEP; p.x += p.vx * STEP; p.y += p.vy * STEP;
      if (p.age >= p.life) parts.splice(i, 1);
    }
  }
  function drawParts() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  G.text = function (str, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = (o.bold === false ? "" : "bold ") + (o.size || 28) + "px " + (o.font || "Arial, Helvetica, sans-serif");
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.baseline || "alphabetic";
    if (o.shadow !== false) { ctx.lineWidth = Math.max(3, (o.size || 28) / 6); ctx.strokeStyle = o.outline || "rgba(0,0,0,.7)"; ctx.lineJoin = "round"; ctx.strokeText(str, x, y); }
    ctx.fillStyle = o.color || "#fff";
    ctx.fillText(str, x, y);
    ctx.restore();
  };

  /* ---------- network ---------- */
  const handlers = {};
  const peerState = {};
  let mineState = null, mineDirty = false, lastSend = 0;
  const sharedHandlers = [];
  G.net = {
    shared: D.shared || {},
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    emit(type, data) {
      (handlers[type] || []).forEach((f) => { try { f(data, G.meId); } catch (e) { reportErr(e); } });
      post({ t: "emit", type, data });
    },
    setMine(obj) { mineState = obj; mineDirty = true; },
    of(id) { return id === G.meId ? mineState : peerState[id] || null; },
    get others() { return G.players.filter((p) => p.id !== G.meId).map((p) => ({ player: p, state: peerState[p.id] || null })); },
    setShared(patch) {
      if (!G.isHost) { warn("setShared is host-only (check G.isHost)"); return; }
      Object.assign(G.net.shared, patch);
      post({ t: "shared", patch });
      sharedHandlers.forEach((f) => { try { f(G.net.shared); } catch (e) { reportErr(e); } });
    },
    onShared(fn) { sharedHandlers.push(fn); }
  };
  let joinFn = [], leaveFn = [], hostFn = [];
  G.onPlayerJoin = (f) => joinFn.push(f);
  G.onPlayerLeave = (f) => leaveFn.push(f);
  G.onHostChange = (f) => hostFn.push(f);

  /* cursors: automatic broadcast of every player's mouse position */
  const cursors = {};
  G.cursorPos = (p) => {
    p = p || G.me;
    if (p.id === G.meId) return { x: M.x, y: M.y };
    const c = cursors[p.id];
    return c ? { x: c.sx, y: c.sy, px: c.px, py: c.py } : null;
  };
  G.drawCursors = function (opt) {
    for (const p of G.players) {
      const c = G.cursorPos(p);
      if (!c) continue;
      drawPointer(p, c.x, c.y, opt);
      if (p.id !== G.meId) G.text(p.name, c.x + 14, c.y + 44, { size: 14, color: p.color });
    }
  };
  let lastCursorSend = 0;

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.t === "mine") { peerState[m.from] = m.v; }
    else if (m.t === "cur") { const c = cursors[m.from] || (cursors[m.from] = { sx: m.x, sy: m.y, x: m.x, y: m.y, px: m.x, py: m.y }); c.px = c.x; c.py = c.y; c.x = m.x; c.y = m.y; }
    else if (m.t === "ev") { (handlers[m.type] || []).forEach((f) => { try { f(m.data, m.from); } catch (er) { reportErr(er); } }); }
    else if (m.t === "shared") { Object.assign(G.net.shared, m.patch); sharedHandlers.forEach((f) => { try { f(G.net.shared); } catch (er) { reportErr(er); } }); }
    else if (m.t === "players") {
      const old = G.players.map((p) => p.id);
      G.players.length = 0; m.list.forEach((p) => G.players.push(p));
      const oh = G.hostId; G.hostId = m.hostId;
      G.me = G.players.find((p) => p.id === G.meId) || G.me;
      G.players.filter((p) => !old.includes(p.id)).forEach((p) => joinFn.forEach((f) => f(p)));
      old.filter((id) => !G.players.some((p) => p.id === id)).forEach((id) => { delete peerState[id]; delete cursors[id]; leaveFn.forEach((f) => f(id)); });
      if (oh !== G.hostId && G.isHost) hostFn.forEach((f) => f());
    }
    else if (m.t === "shot") post({ t: "shot", url: shot(m.w || 320, m.h || 180) });
  });

  /* ---------- errors ---------- */
  const errs = [];
  function reportErr(e) {
    const msg = String((e && e.message) || e);
    if (errs.includes(msg)) return;
    errs.push(msg);
    let line = "";
    try { const m = String(e.stack || "").match(/<anonymous>:(\d+):(\d+)|:(\d+):(\d+)\)?\s*$/m); if (m) line = m[1] || m[3]; } catch (x) {}
    post({ t: "err", msg, line, stack: String((e && e.stack) || "").slice(0, 400) });
  }
  window.addEventListener("error", (e) => {
    const msg = String(e.message);
    if (errs.includes(msg)) return;
    errs.push(msg);
    post({ t: "err", msg, line: e.lineno, col: e.colno });
  });
  window.addEventListener("unhandledrejection", (e) => reportErr(e.reason));

  /* ---------- loop ---------- */
  let spec = null, ready = false, started = false, running = false, errCount = 0, acc = 0, last = 0, overlayGone = G.test;
  G.start = function (s) { spec = s; if (ready) boot(); };
  G.restart = function () { G.time = 0; G.frame = 0; timers.length = 0; parts.length = 0; try { spec.init && spec.init(); } catch (e) { reportErr(e); } };
  G.gameError = null;

  function boot() {
    if (started || !spec) return;
    started = true;
    try { spec.init && spec.init(); } catch (e) { reportErr(e); G.gameError = String(e.message); }
    post({ t: "started" });
    if (G.test) { runTest(); return; }
    running = true; last = performance.now();
    requestAnimationFrame(frame);
  }

  function stepOnce() {
    snapshotInput();
    for (const p of G.players) {
      const c = cursors[p.id];
      if (c) { c.sx += (c.x - c.sx) * .5; c.sy += (c.y - c.sy) * .5; }
    }
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i];
      if (G.time >= t.at) { if (t.every) t.at += t.every; else timers.splice(i, 1); try { t.fn(); } catch (e) { reportErr(e); } }
    }
    try { if (spec.update) spec.update(STEP); } catch (e) { reportErr(e); errCount++; G.gameError = String(e.message); }
    stepParts();
    G.time += STEP; G.frame++;
    const now = performance.now();
    if (mineDirty && now - lastSend > 50) { lastSend = now; mineDirty = false; post({ t: "mine", v: mineState }); }
    if (!G.test && now - lastCursorSend > 50 && (M.x !== M.px || M.y !== M.py || now - lastCursorSend > 500)) { lastCursorSend = now; post({ t: "cur", x: Math.round(M.x), y: Math.round(M.y) }); }
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    try { if (spec.draw) spec.draw(ctx); } catch (e) { reportErr(e); errCount++; G.gameError = String(e.message); }
    drawParts();
    if (G.gameError) {
      ctx.save(); ctx.fillStyle = "rgba(180,0,0,.85)"; ctx.fillRect(0, H - 34, W, 34);
      ctx.fillStyle = "#fff"; ctx.font = "bold 16px monospace"; ctx.textBaseline = "middle";
      ctx.fillText("Game error: " + G.gameError.slice(0, 120), 10, H - 17); ctx.restore();
    }
    if (!overlayGone) {
      ctx.save(); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 44px Arial";
      ctx.fillText(G.title, W / 2, H / 2 - 20); ctx.font = "24px Arial"; ctx.fillText("Click to start", W / 2, H / 2 + 28); ctx.restore();
    }
  }

  window.addEventListener("pointerdown", () => { overlayGone = true; window.focus(); });
  window.addEventListener("keydown", () => { overlayGone = true; });

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (overlayGone) {
      acc += dt;
      while (acc >= STEP) { stepOnce(); acc -= STEP; }
    }
    render();
    if (errCount > 60) { running = false; return; }
    requestAnimationFrame(frame);
  }

  function shot(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(canvas, 0, 0, w, h);
    return c.toDataURL("image/jpeg", .7);
  }
  function sig() {
    const c = document.createElement("canvas"); c.width = 32; c.height = 18;
    const g = c.getContext("2d"); g.drawImage(canvas, 0, 0, 32, 18);
    const d = g.getImageData(0, 0, 32, 18).data;
    let h = 0, nonBlack = 0;
    for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++; }
    return { h, nonBlack: nonBlack / (32 * 18) };
  }

  /* accelerated headless self-test: random input for N frames, then a report */
  function runTest() {
    const steps = D.testSteps || 900;
    const rr = Art.rng(777);
    const sigs = [], shots = [];
    const keysAll = () => (usedKeys.size ? Array.from(usedKeys) : ["left", "right", "up", "down", "space"]);
    let held = new Set();
    const calm = [];
    for (let s = 0; s < steps; s++) {
      const quiet = s < 70;
      if (!quiet && s % 20 === 0) {
        const ks = keysAll();
        held.forEach((k) => { if (rr() < .5) { held.delete(k); down.delete(k); pendRel.add(k); } });
        const k = ks[Math.floor(rr() * ks.length)];
        if (k && !held.has(k)) { held.add(k); down.add(k); pendKeys.add(k); }
        if (rr() < .3) { const k2 = ks[Math.floor(rr() * ks.length)]; if (!held.has(k2)) { held.add(k2); down.add(k2); pendKeys.add(k2); } }
      }
      if (!quiet && s % 7 === 0) { mx = G.clamp(mx + (rr() - .5) * 260, 0, W); my = G.clamp(my + (rr() - .5) * 200, 0, H); }
      if (!quiet && s % 41 === 0) { mDown = true; pendMP = true; } else if (!quiet && s % 41 === 6) { mDown = false; pendMR = true; }
      stepOnce();
      const draw = s % 6 === 0 || s === steps - 1 || s === 14 || s === 49;
      if (draw) render();
      if (s === 14 || s === 49) calm.push(shot(480, 270));
      if (s === 60 || s === 300 || s === steps - 1) { sigs.push(sig()); if (s === 300 || s === steps - 1) shots.push(shot(320, 180)); }
    }
    const frozen = sigs.length >= 2 && sigs.every((x) => x.h === sigs[0].h);
    const blank = sigs.every((x) => x.nonBlack < 0.01);
    post({ t: "testdone", errors: errs.slice(), frozen, blank, steps, keys: Array.from(usedKeys), shots, calm, stats, warns: Array.from(warned) });
  }

  function dataToBuf(url) {
    const b64 = url.slice(url.indexOf(",") + 1);
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  /* ---------- load assets then boot ---------- */
  (async function () {
    for (const a of D.assets) {
      const art = { id: a.id, kind: a.kind, strokes: a.strokes, png: a.png, svg: a.svg, grid: a.grid, bb: a.bb, rig: a.rig };
      try { await Art.prepare(art); } catch (e) { reportErr(e); }
      const bb = art.bb || [0, 0, 1, 1];
      const blank = a.kind === "vector" ? !(a.strokes && a.strokes.length) : !art.img;
      handles[a.name] = { name: a.name, art, blank, aspect: blank ? 1 : bb[2] / bb[3], label: a.label || "", owner: a.owner || "", seed: (a.name.length * 7919 + 13) | 0, hasRig: !!(a.rig && a.rig.points && a.rig.points.length), snd: !!a.snd, ai: !!a.ai };
      if (a.snd && !G.test) {
        try {
          startAudio();
          if (AC) recorded[a.name] = await AC.decodeAudioData(dataToBuf(a.snd));
        } catch (e) {}
      }
      G.assets[a.name] = { name: a.name, label: handles[a.name].label, owner: a.owner, hasRig: handles[a.name].hasRig, blank, aspect: handles[a.name].aspect };
    }
    ready = true;
    post({ t: "ready" });
    if (spec) boot();
    else setTimeout(() => { if (!started) post({ t: "err", msg: "Game code never called G.start()" }); }, 1500);
  })();
})();
