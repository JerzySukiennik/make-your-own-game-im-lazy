/* Host-side game flow: review (ask + evaluate), build (generate, test, repair), publish. */
import { CFG } from "./config.js";
import { api } from "./ai/client.js";
import { slug } from "./util.js";
import { testGame } from "./game/host.js";

/* ---------- asset snapshot for the AI and the game package ---------- */

function thumbOf(art) {
  const S = 192, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, S, S);
  const asp = Art.aspect(art);
  let w = S * .86, h = w / asp;
  if (h > S * .86) { h = S * .86; w = h * asp; }
  Art.drawAsset(g, art, S / 2, S / 2, w, h, {});
  return c.toDataURL("image/jpeg", .85);
}

export function hasContent(a) {
  if (a.kind === "svg") return !!a.svg;
  return !!(a.strokes && a.strokes.length);
}

export function snapshot(room, withImages) {
  const used = new Set();
  const out = [];
  const entries = Object.keys(room.assets).sort((x, y) => (room.assets[x].created || 0) - (room.assets[y].created || 0));
  for (const id of entries) {
    const art = room.art(id);
    if (!art) continue;
    let s = slug(art.name) || "asset";
    let n = s, k = 2;
    while (used.has(n)) n = s + "_" + k++;
    used.add(n);
    const content = hasContent(art);
    const rec = {
      id, slug: n, name: art.name, desc: art.desc || "", label: art.label || "", owner: art.owner || "", ownerName: room.nameOf(art.owner),
      kind: art.kind, grid: art.grid || 64, bb: art.bb || null, rig: art.rig || null, svg: art.svg || null, snd: art.snd || null, ai: !!art.ai,
      content
    };
    if (content) {
      if (!art.bb) art.bb = Art.tightBounds(art);
      rec.bb = art.bb;
      rec.aspect = art.bb ? art.bb[2] / art.bb[3] : 1;
      rec.hasRig = !!(art.rig && art.rig.points && art.rig.points.length);
      rec.rigRoles = rec.hasRig ? Array.from(new Set(art.rig.points.map((p) => p.r))) : [];
      rec.hasSound = !!art.snd;
      if (withImages) { try { Art.invalidate(art); art.strokes = room.strokesOf(id); rec.img = thumbOf(art); } catch (e) { console.warn(e); } }
    }
    rec._strokes = room.strokesOf(id).map((s) => { const o = Object.assign({}, s); delete o.id; delete o.a; return o; });
    out.push(rec);
  }
  return out;
}

function forAI(list) {
  return list.map((a) => ({ slug: a.slug, name: a.name, desc: a.desc, label: a.label, owner: a.label ? a.ownerName : "", aspect: a.aspect, hasRig: a.hasRig, rigRoles: a.rigRoles, hasSound: a.hasSound, ai: a.ai, img: a.img }))
    .filter((a, i) => list[i].content || list[i].desc || list[i].hasSound);
}

function pkgAssets(list) {
  return list.filter((a) => a.content || a.snd).map((a) => ({
    id: a.id, name: a.slug, desc: a.desc, label: a.label, owner: a.owner, kind: a.kind, grid: a.grid, bb: a.bb, rig: a.rig, svg: a.svg, snd: a.snd, ai: a.ai,
    strokes: a.kind === "svg" ? [] : a._strokes
  }));
}

function playerInfo(room) {
  const host = room.hostId();
  return room.playerList().map((p) => ({ name: p.name, isHost: p.id === host }));
}

function qaOf(room, round) {
  const r = room.review["r" + round];
  if (!r || !r.ask) return [];
  let ask; try { ask = JSON.parse(r.ask); } catch (e) { return []; }
  const ans = room.answers["r" + round] || {};
  const out = [];
  for (const q of ask.questions || []) {
    const a = ans[q.id] || {};
    const parts = Object.entries(a).map(([pid, v]) => `${room.nameOf(pid)}: ${v}`);
    if (parts.length) out.push({ q: q.text, a: parts.join(" | ") });
  }
  return out;
}

function allQA(room) {
  const out = [];
  for (let r = 1; r <= (room.meta.round || 1); r++) out.push(...qaOf(room, r));
  return out;
}

/* ---------- readiness ---------- */

export function readiness(room) {
  const list = Object.values(room.assets);
  const text = room.doc.text().trim();
  const bad = list.filter((a) => !((a.desc || "").trim()));
  if (!text && !list.length) return { ok: false, why: "Write what game you want (top box) or draw something first." };
  if (bad.length) return { ok: false, why: `"${bad[0].name || "An asset"}" needs a description. Open it, press DONE and say what it is.` };
  const empty = list.filter((a) => !room.art(a.id) || (!hasContent(room.art(a.id)) && !a.snd));
  if (empty.length) return { ok: false, why: `"${empty[0].name}" is still empty. Draw something or delete it.` };
  return { ok: true };
}

/* ---------- review ---------- */

function setReview(room, round, patch) { return room.b.update(`${room.p}/review/r${round}`, patch); }

export async function startReview(room) {
  room._reviewBusy = true;
  try { await startReviewInner(room); } finally { room._reviewBusy = false; }
}

async function startReviewInner(room) {
  const round = room.meta.round || 1;
  await room.setPhase("review");
  await room.b.set(`${room.p}/review/r${round}`, { status: "asking", t: room.b.now() });
  try {
    const list = snapshot(room, true);
    const res = await api("ask", { prompt: room.doc.text(), assets: forAI(list), players: playerInfo(room), qa: allQA(room) });
    const qs = (res.questions || []).slice(0, 6).map((q, i) => ({ id: "q" + (i + 1), to: (q.to || []).slice(0, 8), text: String(q.text || "").slice(0, 240), options: (q.options || []).slice(0, 4).map((o) => String(o).slice(0, 80)) }));
    await setReview(room, round, { ask: JSON.stringify({ questions: qs }), status: qs.length ? "answering" : "evaluating" });
    if (!qs.length) await runEvalInner(room);
  } catch (e) {
    await setReview(room, round, { status: "error", err: e.message });
  }
}

export async function runEval(room) {
  room._reviewBusy = true;
  try { await runEvalInner(room); } finally { room._reviewBusy = false; }
}

async function runEvalInner(room) {
  const round = room.meta.round || 1;
  await setReview(room, round, { status: "evaluating" });
  try {
    const list = snapshot(room, true);
    const res = await api("eval", { prompt: room.doc.text(), assets: forAI(list), players: playerInfo(room), qa: allQA(room) });
    const ev = {
      summary: String(res.summary || "").slice(0, 400), score: Math.max(1, Math.min(10, +res.score || 5)), verdict: String(res.verdict || "").slice(0, 240),
      missing: (res.missing || []).slice(0, 8).map((m) => ({ name: String(m.name || "").slice(0, 40), why: String(m.why || "").slice(0, 200), desc: String(m.desc || "").slice(0, 300), label: ["avatar", "cursor", "bg"].includes(m.label) ? m.label : "" })),
      tips: (res.tips || []).slice(0, 4).map((t) => String(t).slice(0, 160))
    };
    await setReview(room, round, { eval: JSON.stringify(ev), status: "done" });
  } catch (e) {
    await setReview(room, round, { status: "error", err: e.message });
  }
}

/* ---------- build ---------- */

async function log(room, msg) {
  await room.b.push(`${room.p}/build/log`, { m: msg, t: room.b.now() });
}

function ensureManifest(man, list) {
  man = man && typeof man === "object" ? man : {};
  man.assets = man.assets || {};
  man.title = String(man.title || "Untitled game").slice(0, 60);
  for (const a of list) {
    const m = man.assets[a.slug] = man.assets[a.slug] || {};
    if (!m.size || (!m.size.h && !m.size.w)) m.size = a.label === "bg" ? { w: 1280 } : a.label === "cursor" ? { h: 48 } : { h: 96 };
  }
  return man;
}

function makePkg(code, man, list, title, prompt) {
  return { v: 1, title: man.title || title, prompt: String(prompt || "").slice(0, 1200), code, manifest: man, assets: pkgAssets(list) };
}

async function playtest(room, report, list, base) {
  const issues = [];
  const st = (report.stats && report.stats.draws) || {};
  const fv = (report.stats && report.stats.firstVisible) || {};
  const avatars = list.filter((a) => a.label === "avatar" && a.content);
  const measure = [];
  for (const a of avatars) {
    const s = st[a.slug];
    measure.push(`${a.slug}: drawn ${s ? s.n : 0}x, visible ${s ? s.vis : 0}x, first visible at frame ${fv[a.slug] == null ? "never" : fv[a.slug]}`);
  }
  const players = room.playerList().length || 1;
  if (avatars.length && !avatars.some((a) => st[a.slug] && st[a.slug].vis > 0)) issues.push("No avatar drawing is ever drawn visibly on screen. Draw every player with G.drawPlayer(player, x, y, {h: ~100}) at an on-screen position every frame.");
  else if (avatars.length && avatars.every((a) => fv[a.slug] == null || fv[a.slug] > 90)) issues.push("The avatar is not visible during the first 1.5 seconds. Players must be visible from the first frame.");
  if (report.calm && report.calm.length === 2) {
    try {
      await log(room, "A playtester is checking the first seconds...");
      const res = await api("qa", { prompt: base.prompt, assets: forAI(list).map((a) => Object.assign({}, a, { img: undefined })), players: base.players, calm: report.calm, measure: measure.join("; ") });
      if (res && res.ok === false) for (const i of (res.issues || []).slice(0, 4)) issues.push(String(i).slice(0, 240));
    } catch (e) { /* the playtest is best effort */ }
  }
  return issues;
}

export async function runBuild(room) {
  const b = room.b;
  const gen = room.meta.gen || 0;
  const rebuild = !!room.meta.rebuild;
  await b.set(`${room.p}/build`, { status: "running", t: b.now(), by: room.me.id });
  try {
    await log(room, "Looking at your drawings...");
    let list = snapshot(room, true);
    const round = room.meta.round || 1;
    const ev = (() => { try { return JSON.parse((room.review["r" + round] || {}).eval || "null"); } catch (e) { return null; } })();

    if (room.meta.ai && ev && ev.missing && ev.missing.length && !rebuild) {
      await log(room, `Haiku is drawing ${ev.missing.length} missing thing${ev.missing.length > 1 ? "s" : ""}...`);
      try {
        const res = await api("svg", { prompt: room.doc.text(), assets: forAI(list), players: playerInfo(room), missing: ev.missing });
        let n = 0;
        for (const s of res.assets || []) {
          const svg = Art.cleanSVG(s.svg);
          if (!svg || room.assetCount() >= CFG.maxAssets) continue;
          const miss = ev.missing.find((m) => m.name === s.name) || ev.missing[n] || {};
          const id = await room.newAsset("svg", String(s.name || miss.name || "AI asset").slice(0, 28));
          await room.patchAsset(id, { svg, ai: true, desc: miss.desc || miss.why || "AI-made placeholder", label: miss.label || "", done: true, bb: JSON.stringify([0, 0, 1000, 1000]) });
          n++;
        }
        await new Promise((r) => setTimeout(r, 800));
        for (const id of Object.keys(room.assets)) { const a = room.art(id); if (a && a.kind === "svg" && !a.img) { await Art.prepare(a); a.bb = Art.tightBounds(a) || [0, 0, 1000, 1000]; room.patchAsset(id, { bb: JSON.stringify(a.bb.map((x) => +x.toFixed(1))) }); } }
        list = snapshot(room, true);
        await log(room, `Added ${n} AI-drawn asset${n === 1 ? "" : "s"} (marked AI, you can redraw them later).`);
      } catch (e) { await log(room, "Could not draw the missing assets (" + e.message + "). Continuing without them."); }
    }

    let prev = null;
    if (rebuild && room.game && room.game.pkg) { try { prev = JSON.parse(room.game.pkg); } catch (e) {} }
    if (prev && !list.some((a) => a.content)) {
      list = (prev.assets || []).map((a) => ({
        id: a.id, slug: a.name, name: a.name, desc: a.desc || "", label: a.label || "", owner: a.owner || "", ownerName: "", kind: a.kind, grid: a.grid || 64, bb: a.bb, rig: a.rig, svg: a.svg, snd: a.snd, ai: !!a.ai,
        content: true, aspect: a.bb ? a.bb[2] / a.bb[3] : 1, hasRig: !!(a.rig && a.rig.points && a.rig.points.length), rigRoles: a.rig && a.rig.points ? Array.from(new Set(a.rig.points.map((p) => p.r))) : [], hasSound: !!a.snd, _strokes: a.strokes || []
      }));
    }
    const fbRaw = (await b.get(`${room.p}/feedback`)) || {};
    const feedback = Object.values(fbRaw).map((f) => f.text).filter(Boolean);
    if (feedback.length) await log(room, `Reading ${feedback.length} piece${feedback.length > 1 ? "s" : ""} of feedback from the players...`);
    await log(room, prev ? "Haiku is updating the game code..." : "Haiku is writing the game...");
    const promptText = room.doc.text() || (prev && prev.prompt) || "";
    const base = { prevPrompt: prev ? prev.prompt : "", prompt: promptText, assets: forAI(list), players: playerInfo(room), qa: allQA(room), eval: ev, aiAssets: list.some((a) => a.ai), feedback };
    let res = await api("code", Object.assign({}, base, prev ? { rebuild: { code: prev.code, manifest: prev.manifest } } : {}));
    let man = ensureManifest(res.manifest, list);
    let code = res.code;
    const testPlayers = room.playerList();
    let report = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      await log(room, attempt ? `Testing the fixed game (try ${attempt + 1})...` : "Testing the game...");
      const pkg = makePkg(code, man, list, "Game", promptText);
      report = await testGame(pkg, testPlayers.length ? testPlayers : null, 900);
      if (report.ok) {
        const issues = await playtest(room, report, list, base);
        if (issues.length) { report.ok = false; report.note = "Playtest found: " + issues.join(" | "); report.errors = issues.slice(); }
      }
      if (report.ok) { await log(room, "The game runs. No errors."); break; }
      const why = report.errors.length ? report.errors[0] : report.frozen ? "the screen never changes" : report.blank ? "the screen stays blank" : "the game hung";
      await log(room, `Problem found: ${String(why).slice(0, 140)}`);
      if (attempt === 3) { await log(room, "Could not fully fix it. You can still try the game."); break; }
      const escalate = attempt >= 2;
      await log(room, escalate ? "Calling in the bigger model (Sonnet) to fix it..." : "Haiku is fixing it...");
      try {
        const rep = await api("repair", Object.assign({}, base, { code, manifest: man, report, escalate, free: true }));
        code = rep.code; man = ensureManifest(rep.manifest && Object.keys(rep.manifest).length ? rep.manifest : man, list);
      } catch (e) { await log(room, "The fixer failed: " + e.message); break; }
    }
    const pkg = makePkg(code, man, list, "Game", promptText);
    const thumb = report && report.shots && report.shots.length ? report.shots[report.shots.length - 1] : "";
    await b.set(`${room.p}/game`, { title: pkg.title, gen: gen + 1, pkg: JSON.stringify(pkg), thumb, ok: !!(report && report.ok), t: b.now() });
    await b.update(`${room.p}/build`, { status: "done" });
    await log(room, "Ready! Starting the game...");
    await b.remove(`${room.p}/feedback`);
    await room.setMeta({ phase: "play", gen: gen + 1, rebuild: false, fix: false });
    await room.resetReady();
  } catch (e) {
    await b.update(`${room.p}/build`, { status: "error", err: e.message, code: e.code || "" });
  }
}

/* ---------- gallery ---------- */

export async function publish(room, title) {
  if (!room.game || !room.game.pkg) throw new Error("Nothing to publish yet");
  const id = room.b.newKey();
  const names = room.playerList().map((p) => p.name).join(", ");
  const entry = { title: String(title || room.game.title || "Untitled").slice(0, 60), authors: names.slice(0, 120), n: room.playerList().length, t: room.b.now(), prompt: room.doc.text().slice(0, 200), thumb: room.game.thumb || "", plays: 0 };
  await room.b.set(`gallery/games/${id}`, { pkg: room.game.pkg });
  await room.b.set(`gallery/index/${id}`, entry);
  return id;
}
