/* End-to-end run with the real API: node tests/e2e.mjs <fruit|craft> . Needs the dev server on 5190 and a key in .env. */
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");

const SC = {
  flappy: {
    prompt: "A flappy bird style game but the pipes are ISS modules and the gravity is low. Verify that the player is visible at the beginning and the game works.",
    assets: [["cosmonaut", "the avatar - you hold to fly up and do nothing to fly down.", "avatar"], ["modules", "The modules - after touching it should kill the player and restart the game", ""], ["background", "the background", "bg"]]
  },
  fruit: {
    prompt: "Fruit and bombs fly across the screen. Each player slices them with their own cursor. Most points wins.",
    assets: [["apple", "a juicy red apple. When sliced it splits into two halves that fall away.", ""], ["bomb", "a black round bomb with a lit fuse. Slicing it makes it explode.", ""], ["blade_cursor", "my sword cursor", "cursor"], ["dojo", "a japanese dojo wall background", "bg"]]
  },
  craft: {
    prompt: "A 2D exploration game like Minecraft. Everyone explores a shared world, digs blocks, collects wood and builds.",
    assets: [["tree", "a tall tree. Hold the mouse on it for 5 seconds and it falls apart into 5 wood logs, each of which can then be dug (clicked) to collect it.", ""], ["dirt_block", "a brown dirt block, the ground. Click it to dig it out.", ""], ["stone_block", "a gray stone block found deeper underground. Takes 2 clicks to dig.", ""], ["hero", "my little explorer with a hat", "avatar"], ["sky", "blue sky with clouds", "bg"]]
  }
};
const name = process.argv[2] || "fruit";
const sc = SC[name];
const AI = !!process.env.AI;
if (AI) sc.assets = sc.assets.filter((a) => a[2] !== "bg");
const SP = process.env.SP || "/tmp";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
await page.goto(process.env.BASE || "http://localhost:5190/");
await page.evaluate(async ({ sc, ai }) => {
  const { fixtureAssets } = await import("/tests/fixtures.js");
  MYOG.setName("Jurek");
  const room = await MYOG.newRoom("solo"); await MYOG.openRoom(room);
  room.sendPrompt(sc.prompt);
  if (ai) await room.setMeta({ ai: true });
  const fx = fixtureAssets(sc.assets.map((d) => d[0]));
  for (let i = 0; i < sc.assets.length; i++) {
    const id = await room.newAsset("vector", sc.assets[i][0]);
    for (const s of fx[i].strokes) await room.addStroke(id, s);
    await room.patchAsset(id, { desc: sc.assets[i][1], label: sc.assets[i][2], name: sc.assets[i][0], rig: fx[i].rig ? JSON.stringify(fx[i].rig) : null });
  }
  await new Promise((r) => setTimeout(r, 800));
  await room.setReady(true);
}, { sc, ai: AI });
const wait = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms, polling: 500 });
await wait(() => { const r = MYOG.room.review.r1; return r && (r.status === "answering" || r.status === "done" || r.status === "error"); }, null, 90000);
await page.evaluate(async () => {
  const room = MYOG.room; const r1 = room.review.r1;
  if (r1.status === "answering") {
    for (const q of JSON.parse(r1.ask).questions) await room.b.set(room.p + "/ans/r1/" + q.id + "/" + room.me.id, q.options[0]);
    await new Promise((r) => setTimeout(r, 400));
    [...document.querySelectorAll(".btn")].find((b) => b.textContent === "Continue").click();
  }
});
await wait(() => { const r = MYOG.room.review.r1; return r.status === "done" || r.status === "error"; }, null, 90000);
console.log("review:", await page.evaluate(() => JSON.stringify({ s: MYOG.room.review.r1.status, e: JSON.parse(MYOG.room.review.r1.eval || "{}").score })));
await page.screenshot({ path: SP + `/e2e-${name}-review.png` });
const t0 = Date.now();
await page.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => b.textContent === "Build the game!").click());
await wait(() => MYOG.room.meta.phase === "play" || (MYOG.room.build && MYOG.room.build.status === "error"), null, 420000);
console.log("build secs:", Math.round((Date.now() - t0) / 1000));
const info = await page.evaluate(async () => {
  const room = MYOG.room; const l = await room.b.get(room.p + "/build/log"); const g = room.game;
  return { phase: room.meta.phase, err: room.build && room.build.err, log: Object.values(l || {}).map((x) => x.m), ok: g && g.ok, pkg: g && g.pkg };
});
console.log(JSON.stringify({ phase: info.phase, err: info.err, log: info.log, ok: info.ok, pkgLen: info.pkg && info.pkg.length }, null, 1));
if (info.pkg) fs.writeFileSync(SP + `/pkg-${name}.json`, info.pkg);
await page.waitForTimeout(1500);
const fr = page.frameLocator("iframe.game-frame");
await page.mouse.click(680, 480);
await page.waitForTimeout(2500);
await page.screenshot({ path: SP + `/e2e-${name}-play1.png` });
for (let k = 0; k < 6; k++) {
  await page.mouse.move(300, 250 + k * 40); await page.mouse.down();
  for (let i = 0; i <= 12; i++) { await page.mouse.move(300 + i * 60, 250 + k * 40 + (i % 2) * 90); await page.waitForTimeout(25); }
  await page.mouse.up();
}
for (const key of ["ArrowRight", "ArrowRight", "Space"]) { await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key); }
await page.waitForTimeout(1500);
await page.screenshot({ path: SP + `/e2e-${name}-play2.png` });
if (process.env.FEEDBACK) {
  const g0 = await page.evaluate(() => MYOG.room.meta.gen);
  await page.evaluate(() => [...document.querySelectorAll(".playbar .btn")].find((b) => b.textContent === "Feedback").click());
  await page.waitForSelector(".fb-back");
  await page.click(".chip-btn.fb:nth-child(2)");
  await page.fill(".win.fb textarea", "the blade cursor is hard to see, make it bigger");
  const t2 = Date.now();
  await page.click(".win.fb .btn.huge");
  await wait((g) => MYOG.room.meta.phase === "play" && MYOG.room.meta.gen > g, g0, 300000);
  console.log("feedback fix secs:", Math.round((Date.now() - t2) / 1000), JSON.stringify(await page.evaluate(async () => Object.values(await MYOG.room.b.get(MYOG.room.p + "/build/log")).map((x) => x.m))));
  await page.waitForTimeout(1500); await page.mouse.click(680, 480); await page.waitForTimeout(2500);
  await page.screenshot({ path: SP + `/e2e-${name}-feedback.png` });
}
if (process.env.REBUILD) {
  await page.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => b.textContent === "Edit & rebuild").click());
  await wait(() => MYOG.room.meta.phase === "draw" && MYOG.room.meta.rebuild, null, 20000);
  const g0 = await page.evaluate(() => MYOG.room.meta.gen);
  await page.evaluate(() => { const r = MYOG.room; r.sendPrompt(r.doc.text() + " Also add golden apples worth 5 points that fly faster, and show a big combo counter."); });
  await page.waitForTimeout(500);
  const t1 = Date.now();
  await page.evaluate(() => MYOG.room.setReady(true));
  await wait((g) => MYOG.room.meta.phase === "play" && MYOG.room.meta.gen > g, g0, 300000);
  console.log("rebuild secs:", Math.round((Date.now() - t1) / 1000), JSON.stringify(await page.evaluate(async () => Object.values(await MYOG.room.b.get(MYOG.room.p + "/build/log")).map((x) => x.m))));
  await page.waitForTimeout(1500); await page.mouse.click(680, 480); await page.waitForTimeout(3000);
  await page.screenshot({ path: SP + `/e2e-${name}-rebuilt.png` });
}
if (AI) console.log("assets:", JSON.stringify(await page.evaluate(() => Object.values(MYOG.room.assets).map((a) => a.name + ":" + a.kind + (a.ai ? ":AI" : "")))));
console.log("errors:", JSON.stringify(errs.slice(0, 8)));
await browser.close();
