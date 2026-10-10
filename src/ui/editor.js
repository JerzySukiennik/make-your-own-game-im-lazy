/* Asset editor: vector brush and pixel art, fill, undo, rig, sound, live with other players. */
import { h, toast, throttle } from "../util.js";
import { CFG } from "../config.js";

const PALETTE = ["#000000", "#444444", "#888888", "#cccccc", "#ffffff", "#e6194b", "#f58231", "#ffd400", "#9be564", "#3cb44b", "#00a8a8", "#4363d8", "#911eb4", "#f032e6", "#7a5230", "#e8b58a", "#ffc9de", "#1b2a5c"];

export function openEditor(room, aid, onClose) {
  const me = room.me.id;
  let a = room.art(aid);
  if (!a) return null;
  let tool = "brush", color = "#000000", size = 14, psize = 1, tab = "draw";
  const redo = [];
  let dirty = true, closed = false;
  let drawing = null, hover = null, last = null, anim = "idle";
  const isPixel = () => a.kind === "pixel";
  const isSvg = () => a.kind === "svg";

  const root = h("div", { class: "ed-back" });
  const win = h("div", { class: "ed win" });
  root.append(win);

  const title = h("div", { class: "win-title" },
    h("span", { class: "blink-dot" }), h("span", { class: "ed-title" }, "ASSET EDITOR"),
    h("button", { class: "x", title: "Close", onclick: () => close() }, "X"));
  const tools = h("div", { class: "ed-tools" });
  const stage = h("div", { class: "ed-stage" });
  const side = h("div", { class: "ed-side" });
  const body = h("div", { class: "ed-body" }, tools, stage, side);
  win.append(title, body);

  const view = h("div", { class: "ed-view" });
  const cv = h("canvas", { class: "ed-cv" });
  const over = h("canvas", { class: "ed-over" });
  view.append(cv, over);
  stage.append(view);
  const ctx = cv.getContext("2d");
  const octx = over.getContext("2d");
  const layer = document.createElement("canvas");
  const tmp = document.createElement("canvas");
  let S = 560, dpr = Math.min(2, window.devicePixelRatio || 1);
  let layerRev = -1;

  function fit() {
    const r = stage.getBoundingClientRect();
    S = Math.max(240, Math.min(r.width - 8, r.height - 8, 760));
    view.style.width = view.style.height = S + "px";
    for (const c of [cv, over, layer, tmp]) { c.width = c.height = Math.round(S * dpr); }
    for (const c of [cv, over]) { c.style.width = c.style.height = S + "px"; }
    layerRev = -1; dirty = true;
  }

  /* ---------- tools column ---------- */
  function buildTools() {
    tools.innerHTML = "";
    if (isSvg()) {
      tools.append(h("div", { class: "note" }, "AI-made SVG."), h("button", { class: "btn", onclick: replaceWithBlank }, "Redraw it myself"));
      return;
    }
    const mk = (id, label, key, tip) => h("button", { class: "tool" + (tool === id ? " on" : ""), title: tip + " (" + key + ")", onclick: () => setTool(id) }, label);
    tools.append(
      mk("brush", isPixel() ? "Pencil" : "Brush", "B", "Draw"),
      mk("eraser", "Eraser", "E", "Erase"),
      mk("fill", "Fill", "G", "Fill a closed area"),
      mk("pick", "Pick", "I", "Pick a colour"),
      h("hr"),
      h("label", { class: "lbl" }, isPixel() ? "Size" : "Brush size"),
      h("input", { type: "range", min: isPixel() ? 1 : 2, max: isPixel() ? 6 : 80, value: isPixel() ? psize : (tool === "eraser" ? 40 : size), oninput: (e) => { const v = +e.target.value; if (isPixel()) psize = v; else size = v; } }),
      h("label", { class: "lbl" }, "Colour"),
      h("div", { class: "pal" }, PALETTE.map((c) => h("button", { class: "sw" + (c === color ? " on" : ""), style: { background: c }, onclick: () => { setColor(c); } }))),
      h("input", { type: "color", value: color, class: "colpick", oninput: (e) => setColor(e.target.value) }),
      h("hr"),
      h("div", { class: "row2" },
        h("button", { class: "btn", onclick: undo }, "Undo"),
        h("button", { class: "btn", onclick: doRedo }, "Redo")),
      h("button", { class: "btn warn", onclick: clearAll }, "Clear all")
    );
    tools.querySelector(".colpick").value = color;
  }
  function setTool(t) { tool = t; buildTools(); }
  function setColor(c) { color = c; if (tool === "eraser" || tool === "pick") tool = "brush"; buildTools(); }

  async function undo() {
    const mine = Object.values(room.strokes[aid] || {}).filter((s) => s.a === me).sort((x, y) => (y.z || 0) - (x.z || 0));
    if (!mine.length) { toast("Nothing of yours to undo"); return; }
    const s = mine[0];
    redo.push(JSON.parse(JSON.stringify(s)));
    await room.removeStroke(aid, s.id);
  }
  async function doRedo() {
    const s = redo.pop();
    if (!s) return;
    delete s.id;
    s.z = room.b.now();
    try { await room.addStroke(aid, s); } catch (e) { toast(e.message); }
  }
  async function clearAll() {
    if (!confirm("Clear the whole drawing for everyone in the room?")) return;
    redo.length = 0;
    await room.clearStrokes(aid);
  }
  async function replaceWithBlank() {
    await room.patchAsset(aid, { kind: "vector", svg: null, ai: false, bb: null });
    a = room.art(aid); buildTools(); buildSide(); dirty = true;
  }

  /* ---------- drawing ---------- */
  function pt(e) {
    const r = over.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * Art.LOGICAL, ((e.clientY - r.top) / r.height) * Art.LOGICAL];
  }
  const sendLive = throttle(() => {
    const d = { x: hover ? Math.round(hover[0]) : 0, y: hover ? Math.round(hover[1]) : 0 };
    if (drawing && !isPixel()) {
      const s = drawing.stroke;
      d.s = { t: s.t, c: s.c, w: s.w, p: s.p.length > 600 ? s.p.slice(-600) : s.p };
    }
    room.setLive(aid, d);
  }, 80);

  function cellsAround(x, y, n) {
    const g = a.grid || 64, cx = Math.floor((x / Art.LOGICAL) * g), cy = Math.floor((y / Art.LOGICAL) * g);
    const out = [];
    const off = Math.floor((n - 1) / 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const px = cx - off + i, py = cy - off + j;
      if (px >= 0 && py >= 0 && px < g && py < g) out.push(px, py);
    }
    return out;
  }

  over.addEventListener("pointerdown", (e) => {
    if (isSvg() || e.button === 2) return;
    over.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    hover = [x, y];
    if (tool === "pick") { pick(x, y); return; }
    if (tool === "fill") { doFill(x, y); return; }
    redo.length = 0;
    if (isPixel()) {
      const erase = tool === "eraser";
      drawing = { stroke: { t: erase ? "pe" : "p", c: color, cells: cellsAround(x, y, psize), z: room.b.now() }, seen: new Set() };
      cellsAround(x, y, psize).forEach((v, i, arr) => { if (i % 2 === 0) drawing.seen.add(v + "," + arr[i + 1]); });
    } else {
      const erase = tool === "eraser";
      drawing = { stroke: { t: erase ? "e" : "b", c: color, w: erase ? Math.max(size, 20) : size, p: [Math.round(x), Math.round(y)], z: room.b.now() } };
      if (erase && size < 20) drawing.stroke.w = 40;
    }
    dirty = true; sendLive();
  });
  over.addEventListener("pointermove", (e) => {
    const [x, y] = pt(e);
    hover = [x, y];
    if (drawing) {
      const s = drawing.stroke;
      if (isPixel()) {
        const cs = cellsAround(x, y, psize);
        for (let i = 0; i < cs.length; i += 2) {
          const k = cs[i] + "," + cs[i + 1];
          if (!drawing.seen.has(k)) { drawing.seen.add(k); s.cells.push(cs[i], cs[i + 1]); }
        }
      } else {
        const n = s.p.length;
        const dx = x - s.p[n - 2], dy = y - s.p[n - 1];
        if (dx * dx + dy * dy >= 2.5 && n < 8000) s.p.push(Math.round(x), Math.round(y));
      }
    }
    dirty = true; sendLive();
  });
  async function endStroke() {
    if (!drawing) return;
    const s = drawing.stroke;
    drawing = null;
    room.setLive(aid, { x: hover ? Math.round(hover[0]) : 0, y: hover ? Math.round(hover[1]) : 0 });
    try { await room.addStroke(aid, s); } catch (e) { toast(e.message); }
    dirty = true;
  }
  over.addEventListener("pointerup", endStroke);
  over.addEventListener("pointercancel", endStroke);
  over.addEventListener("pointerleave", () => { hover = null; if (!drawing) room.setLive(aid, null); dirty = true; });

  function pick(x, y) {
    const px = Math.max(0, Math.min(cv.width - 1, Math.floor((x / Art.LOGICAL) * cv.width)));
    const py = Math.max(0, Math.min(cv.height - 1, Math.floor((y / Art.LOGICAL) * cv.height)));
    const d = ctx.getImageData(px, py, 1, 1).data;
    if (d[3] < 40) { toast("That spot is empty"); return; }
    const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    color = hex; tool = "brush"; buildTools();
  }

  async function doFill(x, y) {
    if (isPixel()) {
      const g = a.grid || 64;
      const px = a._px || (a._px = Art.pixelCanvas(a));
      const d = px.getContext("2d").getImageData(0, 0, g, g).data;
      const sx = Math.floor((x / Art.LOGICAL) * g), sy = Math.floor((y / Art.LOGICAL) * g);
      const idx = (sx + sy * g) * 4;
      const t = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
      const same = (i) => (t[3] === 0 ? d[i + 3] === 0 : d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3]);
      const seen = new Uint8Array(g * g), cells = [];
      const st = [sx + sy * g];
      while (st.length) {
        const v = st.pop();
        if (seen[v]) continue;
        seen[v] = 1;
        if (!same(v * 4)) continue;
        const cx = v % g, cy = (v / g) | 0;
        cells.push(cx, cy);
        if (cx > 0) st.push(v - 1); if (cx < g - 1) st.push(v + 1); if (cy > 0) st.push(v - g); if (cy < g - 1) st.push(v + g);
      }
      const hexc = color.toLowerCase();
      if (t[3] > 0 && "#" + [t[0], t[1], t[2]].map((v) => v.toString(16).padStart(2, "0")).join("") === hexc) return;
      redo.length = 0;
      try { await room.addStroke(aid, { t: "p", c: color, cells, z: room.b.now() }); } catch (e) { toast(e.message); }
      return;
    }
    const N = 512;
    a.strokes = room.strokesOf(aid); Art.invalidate(a);
    const c = Art.renderRegion(a, [0, 0, Art.LOGICAL, Art.LOGICAL], N, N);
    const d = c.getContext("2d").getImageData(0, 0, N, N).data;
    const sx = Math.min(N - 1, Math.floor((x / Art.LOGICAL) * N)), sy = Math.min(N - 1, Math.floor((y / Art.LOGICAL) * N));
    const i0 = (sy * N + sx) * 4;
    const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];
    const ok = (i) => {
      const al = d[i + 3];
      if (ta < 30) return al < 30;
      if (al < 30) return false;
      return Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 70 && Math.abs(al - ta) < 90;
    };
    const seen = new Uint8Array(N * N);
    const st = [sx + sy * N];
    let count = 0;
    while (st.length) {
      let v = st.pop();
      if (seen[v]) continue;
      let x0 = v % N; const y0 = (v / N) | 0;
      while (x0 > 0 && !seen[y0 * N + x0 - 1] && ok((y0 * N + x0 - 1) * 4)) x0--;
      let xx = x0, up = false, dn = false;
      while (xx < N && !seen[y0 * N + xx] && ok((y0 * N + xx) * 4)) {
        seen[y0 * N + xx] = 1; count++;
        if (y0 > 0) { const ok2 = !seen[(y0 - 1) * N + xx] && ok(((y0 - 1) * N + xx) * 4); if (ok2 && !up) { st.push((y0 - 1) * N + xx); up = true; } else if (!ok2) up = false; }
        if (y0 < N - 1) { const ok2 = !seen[(y0 + 1) * N + xx] && ok(((y0 + 1) * N + xx) * 4); if (ok2 && !dn) { st.push((y0 + 1) * N + xx); dn = true; } else if (!ok2) dn = false; }
        xx++;
      }
    }
    if (!count) return;
    const m2 = new Uint8Array(N * N);
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      if (seen[yy * N + xx]) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = xx + dx, ny = yy + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N) m2[ny * N + nx] = 1; } }
    }
    const polys = Art.traceMask(m2, N, N, Art.LOGICAL / N);
    if (!polys.length) return;
    redo.length = 0;
    try { await room.addStroke(aid, { t: "f", c: color, polys, z: room.b.now() }); } catch (e) { toast(e.message); }
  }

  /* ---------- rendering ---------- */
  function render() {
    if (closed) return;
    requestAnimationFrame(render);
    if (!dirty && tab === "draw") return;
    if (tab !== "draw") { renderRig(); return; }
    dirty = false;
    a = room.art(aid) || a;
    const W = cv.width;
    if (layerRev !== a._rev || !a.strokes) {
      a = room.art(aid);
      Art.invalidate(a); a.strokes = room.strokesOf(aid);
      const lc = layer.getContext("2d");
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, W, W);
      if (a.kind === "vector") { lc.setTransform(W / Art.LOGICAL, 0, 0, W / Art.LOGICAL, 0, 0); Art.drawStrokes(lc, a.strokes); }
      else if (a.kind === "pixel") { lc.imageSmoothingEnabled = false; lc.drawImage(Art.pixelCanvas(a), 0, 0, W, W); }
      else if (a.kind === "svg") { const sp = Art.spriteCanvas(a, 1024); lc.drawImage(sp, 0, 0, W, W); }
      layerRev = a._rev;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    let base = layer;
    if (drawing && (drawing.stroke.t === "e" || drawing.stroke.t === "pe")) {
      const tc = tmp.getContext("2d");
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, W, W); tc.drawImage(layer, 0, 0);
      applyStroke(tc, drawing.stroke, W);
      base = tmp;
    }
    ctx.drawImage(base, 0, 0);
    if (drawing && drawing.stroke.t !== "e" && drawing.stroke.t !== "pe") applyStroke(ctx, drawing.stroke, W);
    /* other players' strokes in progress and cursors */
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, W, W);
    const live = room.live[aid] || {};
    for (const pid of Object.keys(live)) {
      if (pid === me) continue;
      let d; try { d = JSON.parse(live[pid].d); } catch (e) { continue; }
      if (d.s && d.s.t === "b") { ctx.globalAlpha = .85; applyStroke(ctx, d.s, W); ctx.globalAlpha = 1; }
      const col = room.colorOf(pid), k = W / Art.LOGICAL;
      octx.fillStyle = col; octx.strokeStyle = "#000"; octx.lineWidth = 2 * dpr;
      octx.beginPath(); octx.moveTo(d.x * k, d.y * k); octx.lineTo(d.x * k, d.y * k + 22 * dpr); octx.lineTo(d.x * k + 6 * dpr, d.y * k + 17 * dpr); octx.lineTo(d.x * k + 14 * dpr, d.y * k + 17 * dpr); octx.closePath(); octx.fill(); octx.stroke();
      octx.font = "bold " + 12 * dpr + "px Verdana, sans-serif";
      const nm = room.nameOf(pid);
      octx.fillStyle = col; octx.fillRect(d.x * k + 14 * dpr, d.y * k + 20 * dpr, octx.measureText(nm).width + 8 * dpr, 16 * dpr);
      octx.fillStyle = "#fff"; octx.fillText(nm, d.x * k + 18 * dpr, d.y * k + 32 * dpr);
    }
    /* own brush outline */
    if (hover && !isSvg() && tool !== "fill" && tool !== "pick") {
      const k = W / Art.LOGICAL;
      const rad = isPixel() ? (psize * Art.LOGICAL / (a.grid || 64)) / 2 : (tool === "eraser" ? Math.max(size, 40) : size) / 2;
      octx.strokeStyle = "#000"; octx.lineWidth = dpr; octx.beginPath();
      octx.arc(hover[0] * k, hover[1] * k, Math.max(2, rad * k), 0, 6.283); octx.stroke();
      octx.strokeStyle = "#fff"; octx.beginPath(); octx.arc(hover[0] * k, hover[1] * k, Math.max(2, rad * k) + dpr, 0, 6.283); octx.stroke();
    }
  }
  function applyStroke(c, s, W) {
    if (s.t === "p" || s.t === "pe") {
      const g = a.grid || 64, k = W / g;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = s.t === "pe" ? "destination-out" : "source-over";
      c.fillStyle = s.t === "pe" ? "#000" : s.c;
      for (let i = 0; i < s.cells.length; i += 2) c.fillRect(Math.floor(s.cells[i] * k), Math.floor(s.cells[i + 1] * k), Math.ceil(k), Math.ceil(k));
      c.globalCompositeOperation = "source-over";
      return;
    }
    c.setTransform(W / Art.LOGICAL, 0, 0, W / Art.LOGICAL, 0, 0);
    Art.drawStrokes(c, [s]);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- side panel ---------- */
  const rigCv = h("canvas", { class: "rig-cv", width: 720, height: 720 });
  let roleSel = "body", dragPt = null, rigT = 0, rigT0 = performance.now();

  function buildSide() {
    side.innerHTML = "";
    const tabs = h("div", { class: "tabs" },
      ["draw", "rig", "sound", "info"].map((t) => h("button", { class: "tab" + (tab === t ? " on" : ""), onclick: () => { tab = t; dirty = true; buildSide(); showStage(); } }, { draw: "Draw", rig: "Rig", sound: "Sound", info: "Info" }[t])));
    side.append(tabs);
    const pane = h("div", { class: "pane" });
    side.append(pane);
    if (tab === "draw") {
      pane.append(
        h("p", { class: "hint" }, isPixel() ? "Pixel art: 64 x 64 cells. It scales up crisp." : "Vector: it stays sharp at any size, so draw big and loose."),
        h("p", { class: "hint" }, "Everyone in the room can draw on this at the same time."),
        h("div", { class: "who" }, room.authorsOf(aid).map((id) => h("span", { class: "chip", style: { background: room.colorOf(id) } }, room.nameOf(id)))),
        h("button", { class: "btn big", onclick: finish }, "DONE"));
    } else if (tab === "rig") {
      const roles = h("select", { onchange: (e) => { roleSel = e.target.value; } }, Art.ROLES.map(([k, n]) => h("option", { value: k, selected: k === roleSel }, n)));
      const pts = (a.rig && a.rig.points) || [];
      pane.append(
        h("p", { class: "hint" }, "Optional. Pick a body part, click on the drawing to pin it. The game can then make it walk, flap or wobble. Boxes and trees can skip this."),
        roles,
        h("div", { class: "anims" }, ["idle", "walk", "run", "fly", "spin", "rotate", "hop", "pulse", "wobble"].map((n) => h("button", { class: "btn s" + (anim === n ? " on" : ""), onclick: () => { anim = n; buildSide(); showStage(); } }, n))),
        h("div", { class: "ptlist" }, pts.map((p, i) => h("span", { class: "chip dark" }, (Art.ROLES.find((r) => r[0] === p.r) || [0, p.r])[1], h("b", { onclick: () => { removePoint(i); } }, " x")))),
        pts.length ? h("button", { class: "btn s", onclick: () => saveRig([]) }, "Remove all points") : null);
    } else if (tab === "sound") {
      pane.append(h("p", { class: "hint" }, "Optional. Record up to 4 seconds. The game can play it when this thing is hit, picked up or clicked."), soundUI());
    } else {
      const nm = h("input", { type: "text", maxlength: 28, value: a.name || "", placeholder: "Name (e.g. tree)" });
      const ds = h("textarea", { maxlength: CFG.maxDesc, rows: 5, placeholder: "What is it and what does it do? e.g. a tree. Hold it for 5 seconds and it falls apart into 5 wood logs.", html: "" });
      ds.value = a.desc || "";
      const save = () => room.patchAsset(aid, { name: nm.value.trim() || "Asset", desc: ds.value.trim() });
      nm.addEventListener("change", save); ds.addEventListener("change", save);
      const lab = (v, t, tip) => h("button", { class: "btn s" + ((a.label || "") === v ? " on" : ""), title: tip, onclick: async () => { await room.patchAsset(aid, { label: v }); a = room.art(aid); buildSide(); } }, t);
      pane.append(h("label", { class: "lbl" }, "Name"), nm, h("label", { class: "lbl" }, "What is it? (required)"), ds,
        h("label", { class: "lbl" }, "Special role"),
        h("div", { class: "row2" }, lab("", "None", "A normal thing"), lab("avatar", "My avatar", "You play as this"), lab("cursor", "My cursor", "Your mouse pointer"), lab("bg", "Background", "Scenery")),
        h("button", { class: "btn big", onclick: finish }, "DONE"),
        h("button", { class: "btn warn s", onclick: async () => { if (confirm("Delete this asset for everyone?")) { await room.deleteAsset(aid); close(); } } }, "Delete asset"));
    }
  }

  function showStage() {
    if (tab === "rig") {
      stage.replaceChildren(rigCv);
      const r = stage.getBoundingClientRect();
      const sz = Math.max(260, Math.min(r.width - 8, r.height - 8, 760));
      rigCv.style.width = rigCv.style.height = sz + "px";
    } else if (view.parentNode !== stage) {
      stage.replaceChildren(view);
    }
    view.style.display = tab === "draw" ? "" : "none";
    tools.style.visibility = tab === "draw" ? "" : "hidden";
    stage.classList.toggle("alt", tab !== "draw");
    if (tab === "draw") { fit(); }
  }

  async function finish() {
    const nm = side.querySelector("input[type=text]"), ds = side.querySelector("textarea");
    const asset = room.assets[aid];
    if (tab !== "info" || !ds) { tab = "info"; buildSide(); showStage(); toast("Tell us what it is, then press DONE again"); return; }
    if (!ds.value.trim()) { toast("Write what it is first"); ds.focus(); return; }
    await room.patchAsset(aid, { name: nm.value.trim() || asset.name || "Asset", desc: ds.value.trim(), done: true });
    close();
  }

  /* rig */
  async function saveRig(points) {
    await room.patchAsset(aid, { rig: points.length ? JSON.stringify({ points }) : null });
    a = room.art(aid);
    buildSide();
  }
  function removePoint(i) { const pts = ((a.rig && a.rig.points) || []).slice(); pts.splice(i, 1); saveRig(pts); }
  function rigRect() {
    const asp = Art.aspect(a), W = rigCv.width, H = rigCv.height;
    let w = W * .82, hh = w / asp;
    if (hh > H * .82) { hh = H * .82; w = hh * asp; }
    return { x: (W - w) / 2, y: (H - hh) / 2, w, h: hh };
  }
  function renderRig() {
    const g = rigCv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, rigCv.width, rigCv.height);
    a = room.art(aid) || a;
    if (!a.bb && !(a.strokes && a.strokes.length)) { g.fillStyle = "#666"; g.font = "16px Verdana"; g.fillText("Draw something first", 120, 210); return; }
    const r = rigRect();
    const t = (performance.now() - rigT0) / 1000;
    const rigObj = (a.rig && a.rig.points) ? a : a;
    Art.drawAsset(g, rigObj, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, { anim: anim === "idle" && !(a.rig && a.rig.points && a.rig.points.length) ? null : anim, t });
    const pts = (a.rig && a.rig.points) || [];
    g.font = "bold 11px Verdana";
    for (const p of pts) {
      const x = r.x + p.x * r.w, y = r.y + p.y * r.h;
      g.fillStyle = "#ffd400"; g.strokeStyle = "#000"; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 7, 0, 6.283); g.fill(); g.stroke();
      g.fillStyle = "#000"; g.fillText((Art.ROLES.find((q) => q[0] === p.r) || [0, p.r])[1], x + 10, y + 4);
    }
  }
  rigCv.addEventListener("pointerdown", (e) => {
    const rc = rigCv.getBoundingClientRect(), r = rigRect();
    const x = ((e.clientX - rc.left) / rc.width) * rigCv.width, y = ((e.clientY - rc.top) / rc.height) * rigCv.height;
    const pts = ((a.rig && a.rig.points) || []).map((p) => Object.assign({}, p));
    const hit = pts.findIndex((p) => Math.hypot(r.x + p.x * r.w - x, r.y + p.y * r.h - y) < 12);
    if (hit >= 0) { dragPt = { i: hit, pts }; rigCv.setPointerCapture(e.pointerId); return; }
    if (pts.length >= 14) { toast("That is enough points"); return; }
    const nx = (x - r.x) / r.w, ny = (y - r.y) / r.h;
    if (nx < -.05 || nx > 1.05 || ny < -.05 || ny > 1.05) return;
    pts.push({ r: roleSel, x: +Math.max(0, Math.min(1, nx)).toFixed(3), y: +Math.max(0, Math.min(1, ny)).toFixed(3) });
    saveRig(pts);
  });
  rigCv.addEventListener("pointermove", (e) => {
    if (!dragPt) return;
    const rc = rigCv.getBoundingClientRect(), r = rigRect();
    const x = ((e.clientX - rc.left) / rc.width) * rigCv.width, y = ((e.clientY - rc.top) / rc.height) * rigCv.height;
    const p = dragPt.pts[dragPt.i];
    p.x = +Math.max(0, Math.min(1, (x - r.x) / r.w)).toFixed(3); p.y = +Math.max(0, Math.min(1, (y - r.y) / r.h)).toFixed(3);
    a.rig = { points: dragPt.pts };
  });
  rigCv.addEventListener("pointerup", () => { if (dragPt) { const pts = dragPt.pts; dragPt = null; saveRig(pts); } });

  /* sound */
  function soundUI() {
    const box = h("div", { class: "snd" });
    const has = !!a.snd;
    let rec = null, chunks = [], stream = null;
    const status = h("span", { class: "hint" }, has ? "A sound is attached." : "No sound yet.");
    const recBtn = h("button", { class: "btn", onclick: async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mt = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
        rec = new MediaRecorder(stream, mt ? { mimeType: mt, audioBitsPerSecond: 32000 } : undefined);
        chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          recBtn.textContent = "Record";
          const blob = new Blob(chunks, { type: rec.mimeType });
          const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
          if (url.length > 90000) { toast("Too long. Keep it under 4 seconds."); return; }
          await room.patchAsset(aid, { snd: url });
          a = room.art(aid); buildSide();
        };
        rec.start();
        recBtn.textContent = "Stop";
        status.textContent = "Recording... speak now";
        setTimeout(() => { if (rec && rec.state === "recording") rec.stop(); }, 4000);
      } catch (e) { toast("Microphone not available"); }
    } }, "Record");
    box.append(status, recBtn);
    if (has) {
      box.append(
        h("button", { class: "btn", onclick: () => { const au = new Audio(a.snd); au.play(); } }, "Play"),
        h("button", { class: "btn warn", onclick: async () => { await room.patchAsset(aid, { snd: null }); a = room.art(aid); buildSide(); } }, "Delete"));
    }
    return box;
  }

  /* ---------- wiring ---------- */
  const offs = [];
  offs.push(room.on("assets", (e) => {
    if (e.id !== aid) return;
    if (e.removed) { close(); return; }
    a = room.art(aid) || a; dirty = true;
    if (e.why === "meta") {
      const t = win.querySelector(".ed-title");
      if (t) t.textContent = "ASSET EDITOR - " + (a.name || "");
      if (tab === "draw") { const who = side.querySelector(".who"); if (who) who.replaceChildren(...room.authorsOf(aid).map((id) => h("span", { class: "chip", style: { background: room.colorOf(id) } }, room.nameOf(id)))); }
    }
  }));
  offs.push(room.on("live", (e) => { if (e.id === aid) dirty = true; }));
  const onKey = (e) => {
    if (closed) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? doRedo() : undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (tab !== "draw") return;
    if (k === "b") setTool("brush"); else if (k === "e") setTool("eraser"); else if (k === "g") setTool("fill"); else if (k === "i") setTool("pick");
    else if (k === "[") { if (isPixel()) psize = Math.max(1, psize - 1); else size = Math.max(2, size - 3); }
    else if (k === "]") { if (isPixel()) psize = Math.min(6, psize + 1); else size = Math.min(80, size + 3); }
    else if (k === "escape") close();
  };
  window.addEventListener("keydown", onKey);
  const onResize = () => fit();
  window.addEventListener("resize", onResize);

  function close() {
    if (closed) return;
    closed = true;
    offs.forEach((o) => o());
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    room.setLive(aid, null);
    root.remove();
    onClose && onClose();
  }

  document.body.append(root);
  win.querySelector(".ed-title").textContent = "ASSET EDITOR - " + (a.name || "");
  buildTools(); buildSide(); showStage();
  requestAnimationFrame(() => { fit(); render(); });
  if (!a.desc && tab === "draw") { /* first open: stay on draw */ }
  return { close };
}
