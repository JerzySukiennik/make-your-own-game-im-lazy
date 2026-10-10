/* Two real players with one avatar each, real AI build: checks the playtest does not raise false alarms. */
import { createRequire } from "module";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function player(name) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); await page.goto(process.env.BASE || "http://localhost:5190/"); await page.evaluate((n) => MYOG.setName(n), name); return page; }
const A = await player("Jurke"), B = await player("Ojczulek");
const code = await A.evaluate(async () => { const r = await MYOG.newRoom("firebase", {}); await MYOG.openRoom(r); r.sendPrompt("A cooperative runner. Everyone runs together to the right, jumps over gaps and collects coins."); return r.code; });
await B.evaluate(async (c) => { const r = await MYOG.joinRoom(c); await MYOG.openRoom(r); }, code);
const mk = async (page, name, desc, label, fx) => page.evaluate(async ({ name, desc, label, fx }) => {
  const { fixtureAssets } = await import("/tests/fixtures.js");
  const f = fixtureAssets([fx])[0]; const room = MYOG.room;
  const id = await room.newAsset("vector", name);
  for (const s of f.strokes) await room.addStroke(id, s);
  await room.patchAsset(id, { desc, label, name });
}, { name, desc, label, fx });
await mk(A, "hero_jurke", "Jurke's runner, the avatar", "avatar", "hero");
await mk(B, "robot_ojczulek", "Ojczulek's robot runner, the avatar", "avatar", "robot");
await mk(A, "ground", "a ground block", "", "dirt_block");
await mk(B, "sky", "the sky background", "bg", "sky");
await sleep(1500);
await Promise.all([A, B].map((p) => p.evaluate(() => MYOG.room.setReady(true))));
await A.waitForFunction(() => { const r = MYOG.room.review.r1; return r && ["answering", "done", "error"].includes(r.status); }, null, { timeout: 120000, polling: 500 });
await A.evaluate(async () => { const room = MYOG.room, r1 = room.review.r1; if (r1.status === "answering") { for (const q of JSON.parse(r1.ask).questions) await room.b.set(room.p + "/ans/r1/" + q.id + "/" + room.me.id, q.options[0]); await new Promise((r) => setTimeout(r, 400)); [...document.querySelectorAll(".btn")].find((b) => b.textContent === "Continue").click(); } });
await A.waitForFunction(() => MYOG.room.review.r1.status === "done" || MYOG.room.review.r1.status === "error", null, { timeout: 120000, polling: 500 });
const t0 = Date.now();
await A.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => b.textContent === "Build the game!").click());
await A.waitForFunction(() => MYOG.room.meta.phase === "play" || (MYOG.room.build && MYOG.room.build.status === "error"), null, { timeout: 420000, polling: 700 });
const log = await A.evaluate(async () => Object.values(await MYOG.room.b.get(MYOG.room.p + "/build/log")).map((x) => x.m));
console.log("build secs:", Math.round((Date.now() - t0) / 1000));
console.log(log.join("\n"));
await browser.close();
