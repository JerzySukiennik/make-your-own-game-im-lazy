/* Offline stand-in for the AI (dev only, enabled by MOCK=1 when no API key exists).
   It returns a small but real game written against the same SDK, so the whole pipeline can be tested for free. */

const MOCK_GAME = `
const NAMES = Object.keys(G.assets);
const bgs = NAMES.filter((n) => G.assets[n].label === 'bg');
const things = NAMES.filter((n) => !G.assets[n].blank && !['bg','cursor','avatar'].includes(G.assets[n].label));
const S = { items: [], score: {}, next: 0, nid: 0, banner: 8 };
let hero = null;
G.start({
  init() {
    S.items = []; S.score = {}; S.next = 0; S.banner = 8;
    hero = { x: 200 + G.me.index * 90, y: 560, vy: 0, face: 1 };
    G.net.on('got', (d) => {
      if (!G.isHost) return;
      const i = S.items.findIndex((it) => it.id === d.id);
      if (i >= 0) { S.items.splice(i, 1); S.score[d.by] = (S.score[d.by] || 0) + 1; G.net.setShared({ items: S.items, score: S.score }); }
    });
  },
  update(dt) {
    hero.x = G.clamp(hero.x + G.dirX() * 380 * dt, 50, G.W - 50);
    if (G.dirX()) hero.face = G.dirX();
    if (G.keyPressed('space') && hero.y >= 560) { hero.vy = -820; G.sfx('jump'); }
    hero.vy += 2200 * dt; hero.y = Math.min(560, hero.y + hero.vy * dt); if (hero.y >= 560) hero.vy = 0;
    G.net.setMine({ x: hero.x, y: hero.y, f: hero.face });
    S.banner = Math.max(0, S.banner - dt);
    if (G.isHost) {
      S.next -= dt;
      if (S.next <= 0) { S.next = 1.1; S.items.push({ id: ++S.nid, k: (things.length ? G.pick(things) : null), x: G.W + 60, y: G.rand(380, 560), vx: -G.rand(140, 260) }); }
      for (const it of S.items) it.x += it.vx * dt;
      S.items = S.items.filter((it) => it.x > -80);
      if (G.frame % 6 === 0) G.net.setShared({ items: S.items, score: S.score });
    }
    const list = G.isHost ? S.items : (G.net.shared.items || []);
    for (const it of list) {
      if (Math.abs(it.x - hero.x) < 56 && Math.abs(it.y - hero.y) < 80) {
        G.sfx('coin'); G.burst(it.x, it.y, { n: 12 });
        if (G.isHost) { const i = S.items.findIndex((q) => q.id === it.id); if (i >= 0) S.items.splice(i, 1); S.score[G.meId] = (S.score[G.meId] || 0) + 1; }
        else G.net.emit('got', { id: it.id, by: G.meId });
      }
    }
  },
  draw(ctx) {
    ctx.fillStyle = '#7ec8ff'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.fillStyle = '#5a9b3a'; ctx.fillRect(0, 620, G.W, 100);
    for (const b of bgs) G.draw(b, G.W / 2, G.H / 2, { w: G.W });
    const list = G.isHost ? S.items : (G.net.shared.items || []);
    for (const it of list) { if (it.k) G.draw(it.k, it.x, it.y, { h: 60, anim: 'wobble' }); else { ctx.fillStyle = '#fc0'; ctx.beginPath(); ctx.arc(it.x, it.y, 22, 0, 7); ctx.fill(); } }
    G.drawPlayer(G.me, hero.x, hero.y, { h: 120, anchor: 'bottom', flip: hero.face < 0, anim: 'walk' });
    for (const o of G.net.others) if (o.state) G.drawPlayer(o.player, o.state.x, o.state.y, { h: 120, anchor: 'bottom', flip: o.state.f < 0, anim: 'walk' });
    const sc = G.isHost ? S.score : (G.net.shared.score || {});
    G.players.forEach((p, i) => G.text(p.name + ': ' + (sc[p.id] || 0), 24, 44 + i * 34, { size: 26, color: p.color }));
    if (S.banner > 0) G.text('Arrows move, SPACE jumps. Catch everything!', G.W / 2, 100, { align: 'center', size: 30 });
    G.drawCursors();
  }
});`;

function svgFor(name) {
  const hue = (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="18" width="64" height="64" rx="14" fill="hsl(${hue},80%,62%)" stroke="#111" stroke-width="4"/><circle cx="38" cy="42" r="6" fill="#111"/><circle cx="62" cy="42" r="6" fill="#111"/><path d="M34 64 Q50 78 66 64" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round"/></svg>`;
}

export function mock(stage, p) {
  const assets = p.assets || [];
  if (stage === "ask") {
    const first = assets.find((a) => a.desc);
    return { questions: first ? [{ id: "q1", to: [first.slug], text: `What should happen when a player touches "${first.name}"?`, options: ["It disappears and gives a point", "It hurts the player", "Nothing, it is scenery"] }, { id: "q2", to: [], text: "Should the game end when someone fails, or go on forever?", options: ["Go on forever", "Game over after 3 misses"] }] : [] };
  }
  if (stage === "eval") {
    const hasBg = assets.some((a) => a.label === "bg");
    const missing = [];
    if (!hasBg) missing.push({ name: "Background", why: "The game needs a world to play in.", desc: "A simple scenery background that fills the screen.", label: "bg" });
    if (assets.length < 3) missing.push({ name: "Collectible", why: "Something to collect gives the players a goal.", desc: "A small item that flies by and can be collected.", label: "" });
    return { summary: "A cooperative catch-the-things game (mock review).", score: assets.length >= 3 ? 8 : 5, verdict: assets.length >= 3 ? "Enough to build a fun game." : "Playable, but thin.", missing, tips: ["Add a second kind of collectible for variety."] };
  }
  if (stage === "svg") return { assets: (p.missing || []).map((m) => ({ name: m.name, svg: svgFor(m.name) })) };
  if (stage === "qa") return { ok: true, issues: [] };
  if (stage === "repair") return { code: p.code, manifest: p.manifest || {} };
  const man = { title: (String(p.prompt || "").split(/[.\n]/)[0] || "Mock Game").slice(0, 40) || "Mock Game", assets: {}, players: { min: 1, max: 6 }, controls: "Arrows and Space" };
  for (const a of assets) {
    const big = a.label === "bg";
    man.assets[a.slug] = { size: a.label === "cursor" ? { h: 48 } : big ? { w: 1280 } : { h: 90 } };
  }
  return { code: MOCK_GAME.trim(), manifest: man };
}
