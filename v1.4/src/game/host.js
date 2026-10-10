/* Runs generated games in a sandboxed iframe (no network, no storage) and drives headless tests. */

let SRC = null;
async function sources() {
  if (SRC) return SRC;
  const [art, sdk] = await Promise.all([fetch("src/art/art.js").then((r) => r.text()), fetch("src/game/sdk.js").then((r) => r.text())]);
  SRC = { art, sdk };
  return SRC;
}
const safe = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

export async function srcdoc(pkg, o) {
  const s = await sources();
  const data = {
    title: pkg.title, manifest: pkg.manifest, assets: pkg.assets, players: o.players, me: o.me, hostId: o.hostId,
    seed: o.seed || 1, mode: o.mode || "play", testSteps: o.testSteps, shared: o.shared || {}, probe: !!o.probe, probeKey: o.probeKey || null
  };
  const csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{position:absolute}</style></head><body><script>window.__MYOG=${jsonSafe(data)};</script><script>${safe(s.art)}</script><script>${safe(s.sdk)}</script><script>\n${safe(pkg.code)}\n</script></body></html>`;
}

/* Creates the iframe. `onMsg` receives every message coming out of the game. */
export async function mountGame(container, pkg, o, onMsg) {
  const fr = document.createElement("iframe");
  fr.setAttribute("sandbox", "allow-scripts");
  fr.setAttribute("allow", "autoplay");
  fr.className = "game-frame";
  fr.srcdoc = await srcdoc(pkg, o);
  let loads = 0;
  fr.addEventListener("load", () => {
    if (++loads > 1) { fr.srcdoc = ""; fr.remove(); onMsg({ t: "err", msg: "The game tried to navigate away and was stopped." }); }
  });
  const handler = (e) => { if (e.source === fr.contentWindow && e.data && typeof e.data === "object") onMsg(e.data); };
  window.addEventListener("message", handler);
  container.append(fr);
  return {
    el: fr,
    send(m) { try { fr.contentWindow.postMessage(m, "*"); } catch (e) {} },
    focus() { try { fr.focus(); fr.contentWindow.focus(); } catch (e) {} },
    destroy() { window.removeEventListener("message", handler); fr.remove(); }
  };
}

/* Runs the game headless N times (no key, no key again, then once per key) and reports whether holding each key changes the screen. */
export async function probeKeys(pkg, players, keys) {
  const ps = players && players.length ? players : [{ id: "t1", name: "Tester", color: "#e6194b", index: 0 }];
  const run = (key) => new Promise(async (resolve) => {
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-3000px;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none";
    document.body.append(holder);
    let g = null, done = false;
    const end = (v) => { if (done) return; done = true; try { g && g.destroy(); } catch (e) {} holder.remove(); resolve(v); };
    g = await mountGame(holder, pkg, { players: ps, me: ps[0].id, hostId: ps[0].id, seed: 1234, mode: "test", probe: true, probeKey: key }, (m) => { if (m.t === "probedone") end(m.fp); });
    setTimeout(() => end(null), 15000);
  });
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d; };
  const base1 = await run(null), base2 = await run(null);
  if (!base1 || !base2) return {};
  const noisy = diff(base1, base2) > 40;
  const out = {};
  for (const k of keys) {
    const fp = await run(k);
    if (!fp) continue;
    out[k] = noisy ? true : diff(fp, base1) > 60;
  }
  return out;
}

/* Headless trial: runs N frames with random input in a hidden iframe, returns a report. */
export async function testGame(pkg, players, steps) {
  const ps = players && players.length ? players : [{ id: "t1", name: "Tester", color: "#e6194b", index: 0 }];
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-3000px;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none";
  document.body.append(holder);
  const errors = [], warns = [];
  const result = await new Promise(async (resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const g = await mountGame(holder, pkg, { players: ps, me: ps[0].id, hostId: ps[0].id, seed: 1234, mode: "test", testSteps: steps || 900 }, (m) => {
      if (m.t === "err") errors.push(m.msg + (m.line ? " (line " + m.line + ")" : ""));
      else if (m.t === "warn") warns.push(m.msg);
      else if (m.t === "testdone") finish(m);
    });
    setTimeout(() => finish({ timeout: true }), 45000);
    holder._g = g;
  });
  holder._g && holder._g.destroy();
  holder.remove();
  const e2 = Array.from(new Set(errors.concat(result.errors || [])));
  return {
    steps: steps || 900, errors: e2, frozen: !!result.frozen, blank: !!result.blank, timeout: !!result.timeout,
    warns: Array.from(new Set(warns.concat(result.warns || []))), keys: result.keys || [], shots: result.shots || [], calm: result.calm || [], stats: result.stats || null, probes: result.probes || {},
    ok: !e2.length && !result.frozen && !result.blank && !result.timeout
  };
}
