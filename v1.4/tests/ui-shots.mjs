import { createRequire } from "module";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const SP = process.env.SP;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:5190/");
await page.evaluate(async () => {
  const { fixtureAssets } = await import("/tests/fixtures.js");
  MYOG.setName("Jurek"); const room = await MYOG.newRoom("solo"); await MYOG.openRoom(room);
  room.sendPrompt("A 2D exploration game like Minecraft. Everyone explores a shared world.");
  const defs = [["hero", "my little explorer with a hat", "avatar"], ["tree", "a tall tree, 5 wood logs when held", ""], ["apple", "an apple", ""], ["pixel_cursor", "pixel pointer", "cursor"], ["dojo", "background", "bg"], ["robot", "", ""]];
  const fx = fixtureAssets(defs.map((d) => d[0]));
  for (let i = 0; i < defs.length; i++) {
    const id = await room.newAsset(fx[i].kind === "pixel" ? "pixel" : "vector", defs[i][0]);
    for (const s of fx[i].strokes) await room.addStroke(id, s);
    await room.patchAsset(id, { desc: defs[i][1], label: defs[i][2], name: defs[i][0], rig: fx[i].rig ? JSON.stringify(fx[i].rig) : null, snd: i === 1 ? "data:audio/webm;base64,AAAA" : null });
  }
  await new Promise((r) => setTimeout(r, 900));
});
await page.waitForTimeout(500);
await page.screenshot({ path: SP + "/ui-board.png" });
const cards = await page.$$(".card:not(.add)");
await cards[0].click(); await page.waitForTimeout(700);
await page.screenshot({ path: SP + "/ui-editor.png" });
await page.click(".tab:nth-child(2)"); await page.waitForTimeout(900);
await page.click(".anims .btn:nth-child(2)"); await page.waitForTimeout(600);
await page.screenshot({ path: SP + "/ui-rig.png" });
await page.click(".tab:nth-child(4)"); await page.waitForTimeout(400);
await page.screenshot({ path: SP + "/ui-info.png" });
await page.click(".ed .win-title .x"); await page.waitForTimeout(300);
await (await page.$$(".card:not(.add)"))[3].click(); await page.waitForTimeout(800);
await page.screenshot({ path: SP + "/ui-pixel.png" });
console.log("errors", JSON.stringify(errs));
await browser.close();
