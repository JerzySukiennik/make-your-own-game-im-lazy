/* MYOG Art: shared drawing engine used by the editor and the game SDK. Global: Art. */
(function (root) {
  "use strict";
  const Art = {};
  const L = 1000;
  const TAU = Math.PI * 2;
  Art.LOGICAL = L;

  Art.rng = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  Art.canvas = mk;

  Art.loadImage = function (src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  };

  /* ---------- vector strokes ---------- */

  function strokePath(ctx, p) {
    const n = p.length / 2;
    ctx.beginPath();
    if (n === 1) { ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, TAU); return true; }
    ctx.moveTo(p[0], p[1]);
    if (n === 2) { ctx.lineTo(p[2], p[3]); return false; }
    for (let i = 1; i < n - 1; i++) {
      const mx = (p[i * 2] + p[i * 2 + 2]) / 2, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mx, my);
    }
    ctx.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
    return false;
  }

  Art.sortStrokes = function (list) {
    return list.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  };

  Art.drawStrokes = function (ctx, strokes) {
    for (const s of strokes) {
      if (s.t === "f") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = s.c;
        ctx.beginPath();
        for (const poly of s.polys) {
          if (poly.length < 6) continue;
          ctx.moveTo(poly[0], poly[1]);
          for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
          ctx.closePath();
        }
        ctx.fill("evenodd");
        continue;
      }
      const er = s.t === "e";
      ctx.globalCompositeOperation = er ? "destination-out" : "source-over";
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = s.w;
      ctx.strokeStyle = er ? "#000" : s.c;
      ctx.fillStyle = er ? "#000" : s.c;
      if (strokePath(ctx, s.p)) ctx.fill(); else ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  /* Pixel-art layer: replay cell strokes onto a grid x grid canvas (1 px per cell). */
  Art.pixelCanvas = function (asset) {
    const g = asset.grid || 64;
    const c = mk(g, g);
    const x = c.getContext("2d");
    for (const s of Art.sortStrokes(asset.strokes || [])) {
      const cells = s.cells || [];
      if (s.t === "pe") {
        x.globalCompositeOperation = "destination-out";
        for (let i = 0; i < cells.length; i += 2) x.fillRect(cells[i], cells[i + 1], 1, 1);
      } else {
        x.globalCompositeOperation = "source-over";
        x.fillStyle = s.c;
        for (let i = 0; i < cells.length; i += 2) x.fillRect(cells[i], cells[i + 1], 1, 1);
      }
    }
    x.globalCompositeOperation = "source-over";
    return c;
  };

  /* Render logical region [x,y,w,h] of an asset into a fresh canvas of pw x ph px. */
  Art.renderRegion = function (asset, region, pw, ph) {
    const c = mk(pw, ph);
    const ctx = c.getContext("2d");
    if (asset.kind === "vector") {
      const sx = pw / region[2], sy = ph / region[3];
      ctx.setTransform(sx, 0, 0, sy, -region[0] * sx, -region[1] * sy);
      Art.drawStrokes(ctx, Art.sortStrokes(asset.strokes || []));
    } else if (asset.kind === "pixel") {
      const px = asset._px || (asset._px = Art.pixelCanvas(asset));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(px, region[0], region[1], region[2], region[3], 0, 0, pw, ph);
    } else if (asset.img) {
      const iw = asset.img.width, ih = asset.img.height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(asset.img, (region[0] / L) * iw, (region[1] / L) * ih, (region[2] / L) * iw, (region[3] / L) * ih, 0, 0, pw, ph);
    }
    return c;
  };

  Art.fullRegion = function (asset) {
    return asset.kind === "pixel" ? [0, 0, asset.grid || 64, asset.grid || 64] : [0, 0, L, L];
  };

  /* Tight bounds from a rasterised alpha scan (handles erase and fill). Returns [x,y,w,h] in logical units. */
  Art.tightBounds = function (asset) {
    const reg = Art.fullRegion(asset);
    const N = 256;
    const c = Art.renderRegion(asset, reg, N, N);
    const d = c.getContext("2d").getImageData(0, 0, N, N).data;
    let x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (d[(y * N + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const k = reg[2] / N, pad = 1;
    const bx = Math.max(0, (x0 - pad) * k), by = Math.max(0, (y0 - pad) * k);
    const ex = Math.min(reg[2], (x1 + 1 + pad) * k), ey = Math.min(reg[3], (y1 + 1 + pad) * k);
    return [bx, by, ex - bx, ey - by];
  };

  /* ---------- sprite cache ---------- */

  const BUCKETS = [32, 64, 128, 256, 512, 1024];
  Art.spriteCanvas = function (asset, need) {
    let b = BUCKETS[BUCKETS.length - 1];
    for (const k of BUCKETS) if (k >= need) { b = k; break; }
    asset._sc = asset._sc || {};
    if (asset._sc[b]) return asset._sc[b];
    const bb = asset.bb || Art.tightBounds(asset) || [0, 0, 1, 1];
    asset.bb = bb;
    const asp = bb[2] / bb[3];
    const pw = asp >= 1 ? b : Math.max(1, Math.round(b * asp));
    const ph = asp >= 1 ? Math.max(1, Math.round(b / asp)) : b;
    const c = Art.renderRegion(asset, bb, pw, ph);
    asset._sc[b] = c;
    return c;
  };
  Art.invalidate = function (asset) { asset._sc = null; asset._mask = null; asset._pieces = null; asset._px = null; };
  Art.aspect = function (asset) {
    const bb = asset.bb || Art.tightBounds(asset) || [0, 0, 1, 1];
    asset.bb = bb;
    return bb[2] / bb[3];
  };

  Art.mask = function (asset) {
    if (asset._mask) return asset._mask;
    const asp = Art.aspect(asset);
    const S = 48;
    const w = asp >= 1 ? S : Math.max(2, Math.round(S * asp));
    const h = asp >= 1 ? Math.max(2, Math.round(S / asp)) : S;
    const c = Art.renderRegion(asset, asset.bb, w, h);
    const d = c.getContext("2d").getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    asset._mask = { w, h, d: m };
    return asset._mask;
  };
  Art.maskHit = function (asset, u, v) {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const m = Art.mask(asset);
    return m.d[(v * m.h | 0) * m.w + (u * m.w | 0)] === 1;
  };

  /* ---------- SVG ---------- */

  Art.cleanSVG = function (s) {
    s = String(s || "").slice(0, 60000);
    s = s.replace(/<\s*(script|foreignObject|iframe|object|embed|image|use|style)[\s\S]*?(<\/\s*\1\s*>|\/>)/gi, "");
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
    s = s.replace(/(xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "");
    const m = s.match(/<svg[\s\S]*<\/svg>/i);
    if (!m) return null;
    s = m[0];
    if (!/viewBox\s*=/.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 100 100"');
    if (!/xmlns\s*=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    s = s.replace(/<svg([^>]*?)\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "<svg$1");
    s = s.replace(/<svg([^>]*?)\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "<svg$1");
    return s;
  };
  Art.svgToDataURL = function (svg) {
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  };

  /* Prepare an asset for drawing (loads images). */
  Art.prepare = async function (asset) {
    if (asset.kind === "svg" && asset.svg && !asset.img) {
      const clean = Art.cleanSVG(asset.svg);
      asset.img = clean ? await Art.loadImage(Art.svgToDataURL(clean)) : null;
      if (asset.img) {
        const big = mk(1024, 1024);
        const g = big.getContext("2d");
        g.drawImage(asset.img, 0, 0, 1024, 1024);
        asset.img = big;
      }
    }
    if (!asset.bb) asset.bb = Art.tightBounds(asset) || [0, 0, L, L];
    return asset;
  };

  /* ---------- flood fill to vector polygons ---------- */

  function rdp(pts, eps) {
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let md = 0, mi = -1;
      const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  Art.traceMask = function (mask, w, h, scale) {
    const edges = new Map();
    const add = (x0, y0, x1, y1) => {
      const k = x0 + "," + y0;
      let a = edges.get(k);
      if (!a) edges.set(k, (a = []));
      a.push([x1, y1]);
    };
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
    const loops = [];
    for (const [k0, list0] of edges) {
      while (list0.length) {
        const [sx, sy] = k0.split(",").map(Number);
        let cx = sx, cy = sy;
        const pts = [[cx, cy]];
        let guard = 0;
        for (;;) {
          const list = edges.get(cx + "," + cy);
          if (!list || !list.length) break;
          const nx = list.pop();
          cx = nx[0]; cy = nx[1];
          if (cx === sx && cy === sy) break;
          pts.push([cx, cy]);
          if (++guard > 400000) break;
        }
        if (pts.length >= 4) loops.push(pts);
      }
    }
    const out = [];
    for (let lp of loops) {
      let far = 0, fd = -1;
      for (let i = 1; i < lp.length; i++) { const d2 = (lp[i][0] - lp[0][0]) ** 2 + (lp[i][1] - lp[0][1]) ** 2; if (d2 > fd) { fd = d2; far = i; } }
      const h1 = rdp(lp.slice(0, far + 1), 0.9), h2 = rdp(lp.slice(far).concat([lp[0]]), 0.9);
      lp = h1.concat(h2.slice(1, -1));
      if (lp.length < 3) continue;
      const flat = [];
      for (const p of lp) flat.push(+(p[0] * scale).toFixed(1), +(p[1] * scale).toFixed(1));
      out.push(flat);
    }
    return out;
  };

  /* ---------- rig animation ---------- */

  const NAMES = ["idle", "walk", "run", "fly", "spin", "rotate", "hop", "pulse", "wobble", "shake", "hit"];
  Art.ANIMS = NAMES;
  Art.ROLES = [
    ["body", "Body"], ["head", "Head"], ["legL", "Left leg"], ["legR", "Right leg"],
    ["armL", "Left arm"], ["armR", "Right arm"], ["wingL", "Left wing"], ["wingR", "Right wing"],
    ["tail", "Tail"], ["part", "Loose part"]
  ];

  function roleOffset(anim, r, t) {
    const s = Math.sin, c = Math.cos;
    switch (anim) {
      case "walk": case "run": {
        const f = anim === "run" ? 2.6 : 1.6, a = anim === "run" ? 1.5 : 1;
        const S = s(t * TAU * f), C = c(t * TAU * f);
        switch (r) {
          case "legL": return [S * .15 * a, -Math.max(0, C) * .08 * a];
          case "legR": return [-S * .15 * a, -Math.max(0, -C) * .08 * a];
          case "armL": return [-S * .11 * a, 0];
          case "armR": return [S * .11 * a, 0];
          case "body": return [0, -Math.abs(S) * .035 * a];
          case "head": return [S * .015, -Math.abs(S) * .05 * a];
          case "tail": return [S * .1, 0];
          case "part": return [S * .05, C * .03];
        }
        return [0, 0];
      }
      case "fly": {
        const S = s(t * TAU * 3);
        switch (r) {
          case "wingL": case "wingR": case "armL": case "armR": return [0, S * .22];
          case "body": return [0, -S * .05];
          case "head": return [0, -S * .04];
          case "tail": return [0, S * .07];
          case "part": return [0, S * .08];
        }
        return [0, 0];
      }
      case "idle": {
        const S = s(t * TAU * .7);
        switch (r) {
          case "head": return [0, S * .02];
          case "body": return [0, S * .01];
          case "armL": case "armR": return [0, S * .025];
          case "tail": return [S * .03, 0];
          case "part": return [0, S * .02];
        }
        return [0, 0];
      }
      case "wobble": {
        const ph = r.length * 1.7;
        return [s(t * TAU * 2 + ph) * .05, c(t * TAU * 2.3 + ph) * .04];
      }
      case "hit": case "shake": {
        const k = anim === "hit" ? Math.max(0, 1 - (t % 1) * 2.2) : 1;
        return [s(t * 60 + r.length) * .05 * k, c(t * 53) * .03 * k];
      }
    }
    return [0, 0];
  }

  Art.globalAnim = function (anim, t) {
    const g = { sx: 1, sy: 1, rot: 0, dx: 0, dy: 0 };
    switch (anim) {
      case "spin": g.sx = Math.cos(t * TAU * 1.1); if (Math.abs(g.sx) < .06) g.sx = .06 * Math.sign(g.sx || 1); break;
      case "rotate": g.rot = t * TAU * .5; break;
      case "hop": { const p = Math.abs(Math.sin(t * TAU * .9)); g.dy = -p * .18; g.sy = 1 + (1 - p) * .1 - p * .04; g.sx = 1 - (1 - p) * .06; break; }
      case "pulse": { const p = Math.sin(t * TAU * 1.2) * .07; g.sx = 1 + p; g.sy = 1 + p; break; }
      case "shake": g.dx = Math.sin(t * 70) * .02; break;
      case "hit": { const k = Math.max(0, 1 - (t % 1) * 2.2); g.dx = Math.sin(t * 70) * .04 * k; break; }
      case "wobble": g.rot = Math.sin(t * TAU * 1.4) * .08; break;
      case "walk": case "run": g.dy = -Math.abs(Math.sin(t * TAU * (anim === "run" ? 2.6 : 1.6))) * .02; break;
      case "idle": g.sy = 1 + Math.sin(t * TAU * .7) * .012; break;
      case "fly": g.dy = Math.sin(t * TAU * 1.5) * .02; break;
    }
    return g;
  };

  function dispFn(rig, anim, t) {
    const pts = rig.points.map((p) => ({ x: p.x, y: p.y, o: roleOffset(anim, p.r, t) }));
    return (u, v) => {
      let wx = 0, wy = 0, ws = 0.18;
      for (const p of pts) {
        const d2 = (u - p.x) * (u - p.x) + (v - p.y) * (v - p.y);
        const w = Math.exp(-d2 / 0.09);
        wx += w * p.o[0]; wy += w * p.o[1]; ws += w;
      }
      return [wx / ws, wy / ws];
    };
  }

  function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
    const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1];
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-9) return;
    const du1 = d1[0] - d0[0], dv1 = d1[1] - d0[1], du2 = d2[0] - d0[0], dv2 = d2[1] - d0[1];
    const a = (du1 * dy2 - du2 * dy1) / det, c = (du2 * dx1 - du1 * dx2) / det;
    const b = (dv1 * dy2 - dv2 * dy1) / det, d = (dv2 * dx1 - dv1 * dx2) / det;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const ex = (p) => [p[0] + Math.sign(p[0] - cx) * .6, p[1] + Math.sign(p[1] - cy) * .6];
    const q0 = ex(d0), q1 = ex(d1), q2 = ex(d2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  const GN = 8;
  function drawMesh(ctx, img, w, h, disp) {
    const sw = img.width, sh = img.height;
    const V = [];
    for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) {
      const u = i / GN, v = j / GN, o = disp(u, v);
      V.push({ s: [u * sw, v * sh], d: [(u + o[0] - .5) * w, (v + o[1] - .5) * h] });
    }
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const a = V[j * (GN + 1) + i], b = V[j * (GN + 1) + i + 1], c = V[(j + 1) * (GN + 1) + i], d = V[(j + 1) * (GN + 1) + i + 1];
      drawTri(ctx, img, a.s, b.s, c.s, a.d, b.d, c.d);
      drawTri(ctx, img, b.s, d.s, c.s, b.d, d.d, c.d);
    }
  }

  /* Draw an asset centred at (cx,cy) with size w x h. opt: anim, t, rot, flip, flipY, alpha, dpr */
  Art.drawAsset = function (ctx, asset, cx, cy, w, h, opt) {
    opt = opt || {};
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b) || 1;
    const need = Math.max(w, h) * sc * (opt.zoomHint || 1);
    const spr = Art.spriteCanvas(asset, Math.min(1024, Math.max(16, need)));
    const g = opt.anim ? Art.globalAnim(opt.anim, opt.t || 0) : { sx: 1, sy: 1, rot: 0, dx: 0, dy: 0 };
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    ctx.translate(cx + g.dx * w, cy + g.dy * h);
    const rot = (opt.rot || 0) + g.rot;
    if (rot) ctx.rotate(rot);
    ctx.scale((opt.flip ? -1 : 1) * g.sx, (opt.flipY ? -1 : 1) * g.sy);
    ctx.imageSmoothingEnabled = asset.kind !== "pixel";
    if (opt.anim && asset.rig && asset.rig.points && asset.rig.points.length) {
      drawMesh(ctx, spr, w, h, dispFn(asset.rig, opt.anim, opt.t || 0));
    } else {
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  };

  /* ---------- slicing ---------- */

  function clipPoly(poly, nx, ny, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  Art.slicePolys = function (spec, aspect, seed) {
    const mode = spec.mode || "slices";
    const polys = [];
    if (mode === "grid") {
      const cols = Math.max(1, Math.min(8, spec.cols | 0 || 2)), rows = Math.max(1, Math.min(8, spec.rows | 0 || 2));
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        polys.push([[i / cols, j / rows], [(i + 1) / cols, j / rows], [(i + 1) / cols, (j + 1) / rows], [i / cols, (j + 1) / rows]]);
    } else if (mode === "shatter") {
      const n = Math.max(2, Math.min(24, spec.n | 0 || 6));
      const rnd = Art.rng(seed || 1);
      const cols = Math.max(1, Math.round(Math.sqrt(n * aspect))), rows = Math.max(1, Math.ceil(n / cols));
      const seeds = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (seeds.length >= n) break;
        seeds.push([((i + .15 + rnd() * .7) / cols) * aspect, (j + .15 + rnd() * .7) / rows]);
      }
      for (let i = 0; i < seeds.length; i++) {
        let poly = [[0, 0], [aspect, 0], [aspect, 1], [0, 1]];
        for (let j = 0; j < seeds.length && poly.length; j++) {
          if (i === j) continue;
          const nx = seeds[j][0] - seeds[i][0], ny = seeds[j][1] - seeds[i][1];
          const c = (seeds[j][0] ** 2 + seeds[j][1] ** 2 - seeds[i][0] ** 2 - seeds[i][1] ** 2) / 2;
          poly = clipPoly(poly, nx, ny, c);
        }
        if (poly.length >= 3) polys.push(poly.map((p) => [p[0] / aspect, p[1]]));
      }
    } else {
      const n = Math.max(2, Math.min(16, spec.n | 0 || 3));
      const ax = spec.axis === "x";
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        polys.push(ax ? [[a, 0], [b, 0], [b, 1], [a, 1]] : [[0, a], [1, a], [1, b], [0, b]]);
      }
    }
    return polys;
  };

  /* Returns [{c, ox, oy, nw, nh, cx, cy}] in unit coordinates relative to the whole sprite. */
  Art.pieces = function (asset, spec, seed) {
    const key = JSON.stringify(spec) + "|" + seed;
    if (asset._pieces && asset._pieces.key === key) return asset._pieces.list;
    const asp = Art.aspect(asset);
    const polys = Art.slicePolys(spec || {}, asp, seed);
    const B = 512;
    const whole = Art.spriteCanvas(asset, B);
    const W = whole.width, H = whole.height;
    const list = [];
    for (const poly of polys) {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const px0 = Math.floor(x0 * W), py0 = Math.floor(y0 * H), px1 = Math.ceil(x1 * W), py1 = Math.ceil(y1 * H);
      const pw = Math.max(1, px1 - px0), ph = Math.max(1, py1 - py0);
      const c = mk(pw, ph);
      const g = c.getContext("2d");
      g.beginPath();
      poly.forEach((p, i) => (i ? g.lineTo(p[0] * W - px0, p[1] * H - py0) : g.moveTo(p[0] * W - px0, p[1] * H - py0)));
      g.closePath(); g.clip();
      g.drawImage(whole, -px0, -py0);
      const t = mk(12, 12), tg = t.getContext("2d");
      tg.drawImage(c, 0, 0, 12, 12);
      const td = tg.getImageData(0, 0, 12, 12).data;
      let any = 0;
      for (let i = 3; i < td.length; i += 4) if (td[i] > 20) any++;
      if (any < 2) continue;
      list.push({ c, ox: px0 / W, oy: py0 / H, nw: pw / W, nh: ph / H, cx: (px0 + pw / 2) / W, cy: (py0 + ph / 2) / H });
    }
    asset._pieces = { key, list };
    return list;
  };

  root.Art = Art;
})(typeof window !== "undefined" ? window : globalThis);
