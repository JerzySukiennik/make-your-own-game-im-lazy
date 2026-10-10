/* Multiplayer audit on the real Firebase: node tests/mp-audit.mjs  (dev server on 5190, pkg-fruit.json in $SP) */
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const BASE = process.env.BASE || "http://localhost:5190/";
const SP = process.env.SP;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const results = [];
const rec = (name, ok, info) => { results.push({ name, ok, info }); console.log((ok ? "PASS " : "FAIL ") + name + (info ? "  :: " + info : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE);
  await page.evaluate((n) => MYOG.setName(n), name);
  return { ctx, page, name, errs };
}
const ev = (p, fn, arg) => p.page.evaluate(fn, arg);

/* ---- T1: join, capacity (7th player refused) ---- */
const host = await player("Host");
const code = await ev(host, async () => { const r = await MYOG.newRoom("firebase", { pub: false }); await MYOG.openRoom(r); return r.code; });
const guests = [];
for (let i = 1; i <= 5; i++) { const g = await player("P" + i); await ev(g, async (c) => { const r = await MYOG.joinRoom(c); await MYOG.openRoom(r); }, code); guests.push(g); }
await sleep(1500);
const n6 = await ev(host, () => MYOG.room.activePlayers().length);
rec("6 players fit in a room", n6 === 6, "players=" + n6);
const seventh = await player("P7");
const err7 = await ev(seventh, async (c) => { try { await MYOG.joinRoom(c); return "joined"; } catch (e) { return e.message; } }, code);
rec("7th player is refused", err7 === "Room is full", err7);
const colors = await ev(host, () => MYOG.room.activePlayers().map((p) => p.color));
rec("all 6 colours are distinct", new Set(colors).size === 6, colors.join(","));
await seventh.ctx.close();

/* ---- T2: concurrent drawing on one asset ---- */
const aid = await ev(host, async () => MYOG.room.newAsset("vector", "shared"));
await sleep(800);
await Promise.all([host, ...guests].map((p, i) => ev(p, async ({ aid, i }) => {
  for (let k = 0; k < 8; k++) await MYOG.room.addStroke(aid, { t: "b", c: "#000", w: 10, p: [100 + i * 50, 100 + k * 40, 300 + i * 50, 120 + k * 40], z: MYOG.room.b.now() });
}, { aid, i })));
await sleep(2500);
const counts = await Promise.all([host, ...guests].map((p) => ev(p, (aid) => Object.keys(MYOG.room.strokes[aid] || {}).length, aid)));
rec("48 strokes drawn by 6 players converge everywhere", counts.every((c) => c === 48), counts.join(","));

/* ---- T3: concurrent typing converges ---- */
await Promise.all([host, ...guests].map((p, i) => ev(p, async (i) => { MYOG.room.sendPrompt(MYOG.room.doc.text() + `[${i}]`); }, i)));
await sleep(2500);
const texts = await Promise.all([host, ...guests].map((p) => ev(p, () => MYOG.room.doc.text())));
rec("6 simultaneous prompt edits converge to identical text", new Set(texts).size === 1 && texts[0].length >= 18, JSON.stringify(texts[0]));

/* ---- T4: kick ---- */
const victim = guests[0];
const vid = await ev(victim, () => MYOG.me.id);
await ev(host, (id) => MYOG.room.kick(id), vid);
await sleep(12000);
const listed = await ev(host, (id) => MYOG.room.activePlayers().some((p) => p.id === id), vid);
const rawRec = await ev(host, async (id) => JSON.stringify(await MYOG.room.b.get(MYOG.room.p + "/players/" + id)), vid);
const victimStill = await ev(victim, () => !!document.querySelector(".roomhead"));
rec("kicked player stays out of the room", !listed, `listed=${listed} rawRecord=${rawRec} victimStillInRoomUI=${victimStill}`);

/* ---- T5: returning player after being dropped for inactivity (record removed) ---- */
const p2 = guests[1];
const pid2 = await ev(p2, () => MYOG.me.id);
await ev(host, (id) => MYOG.room.b.remove(MYOG.room.p + "/players/" + id), pid2);
await sleep(11000);
const raw2 = await ev(host, async (id) => JSON.stringify(await MYOG.room.b.get(MYOG.room.p + "/players/" + id)), pid2);
let okRec = false; try { const o = JSON.parse(raw2); okRec = !!(o && o.name && o.color && o.joined); } catch (e) {}
rec("a dropped player that is still online gets a full record back", okRec, raw2);

/* ---- T6: play phase, late join and host migration ---- */
const pkg = fs.readFileSync(SP + "/pkg-fruit.json", "utf8");
await ev(host, async (pkg) => {
  await MYOG.room.b.set(MYOG.room.p + "/game", { title: "Audit game", gen: 1, pkg, thumb: "", ok: true, t: MYOG.room.b.now() });
  await MYOG.room.setMeta({ phase: "play", gen: 1 });
}, pkg);
await sleep(3500);
const frames = await Promise.all([host, guests[2], guests[3]].map((p) => p.page.evaluate(() => !!document.querySelector("iframe.game-frame"))));
rec("game frame mounts for everyone when the phase flips to play", frames.every(Boolean), frames.join(","));
const late = await player("Late");
await ev(late, async (c) => { const r = await MYOG.joinRoom(c); await MYOG.openRoom(r); }, code);
await sleep(3500);
const lateFrame = await late.page.evaluate(() => !!document.querySelector("iframe.game-frame"));
rec("late joiner lands directly in the running game", lateFrame);
const players1 = await Promise.all([host, late].map((p) => p.page.frames().filter((f) => f !== p.page.mainFrame())[0].evaluate(() => G.players.length).catch(() => -1)));
rec("late joiner and host see the same player count inside the game", players1[0] === players1[1] && players1[0] >= 4, players1.join(","));
const hostId0 = await ev(late, () => MYOG.room.hostId());
await host.ctx.close();
await sleep(9000);
const newHostId = await ev(late, () => MYOG.room.hostId());
const newHostIsHost = await ev(late, () => MYOG.room.isHost());
const inGameHost = await late.page.frames().filter((f) => f !== late.page.mainFrame())[0].evaluate(() => G.isHost).catch(() => null);
rec("host leaving hands the host role over", newHostId !== hostId0, `old=${hostId0} new=${newHostId}`);
const alive = [guests[1], guests[2], guests[3], guests[4], late];
const roomHosts = (await Promise.all(alive.map((p) => ev(p, () => (MYOG.room.isHost() ? 1 : 0))))).reduce((a, b) => a + b, 0);
const gameHosts = (await Promise.all(alive.map((p) => p.page.frames().filter((f) => f !== p.page.mainFrame())[0].evaluate(() => (G.isHost ? 1 : 0)).catch(() => 0)))).reduce((a, b) => a + b, 0);
rec("exactly one host in the room and exactly one inside the running game", roomHosts === 1 && gameHosts === 1, `roomHosts=${roomHosts} gameHosts=${gameHosts}`);

/* ---- T7: host leaves during build ---- */
const room2host = await player("H2");
const code2 = await ev(room2host, async () => { const r = await MYOG.newRoom("firebase", {}); await MYOG.openRoom(r); await r.setMeta({ phase: "build" }); await r.b.set(r.p + "/build", { status: "running", t: r.b.now(), by: r.me.id }); return r.code; });
const g2 = await player("G2");
await ev(g2, async (c) => { const r = await MYOG.joinRoom(c); await MYOG.openRoom(r); }, code2);
await sleep(1500);
await room2host.ctx.close();
await sleep(70000);
const st = await ev(g2, () => MYOG.room.build && MYOG.room.build.status);
rec("a build abandoned by a leaving host is picked up again", st !== "running", "status after 70s=" + st);

const bad = [...guests, late, g2].flatMap((p) => p.errs).concat(host.errs);
rec("no uncaught page errors in any client", bad.length === 0, bad.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
