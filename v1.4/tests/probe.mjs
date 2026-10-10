import { createRequire } from "module";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5190/");
const res = await page.evaluate(async () => {
  const { probeKeys } = await import("/src/game/host.js");
  const { fixtureAssets } = await import("/tests/fixtures.js");
  const assets = fixtureAssets(["hero"], { hero: { label: "avatar", owner: "t1" } });
  const pl = [{ id: "t1", name: "T", color: "#f00", index: 0 }];
  const body = (jumpOk, follow) => `
    const p = { x: 300, y: 500, vy: 0, ground: ${jumpOk} };
    G.start({ init(){}, update(dt){
      if (G.keyPressed("space") && p.ground) { p.vy = -700; p.ground = false; }
      p.vy += 1800 * dt; p.y += p.vy * dt;
      if (p.y >= 500) { p.y = 500; p.vy = 0; ${jumpOk ? "p.ground = true;" : ""} }
    }, draw(c){ c.fillStyle = "#9cf"; c.fillRect(0,0,1280,720);
      c.fillStyle = "#463"; for (let i = 0; i < 20; i++) c.fillRect(i * 70, ${follow ? "620 + (p.y - 500)" : "620"}, 40, 100);
      G.draw("hero", ${follow ? "640" : "p.x"}, ${follow ? "500" : "p.y"}, { h: 120 }); } });`;
  const out = {};
  for (const [name, ok, follow] of [["working jump, fixed camera", true, false], ["blocked jump", false, false], ["working jump, camera follows player", true, true]]) {
    out[name] = await probeKeys({ title: "t", manifest: { assets: { hero: { size: { h: 120 } } } }, assets, code: body(ok, follow) }, pl, ["space"]);
  }
  return out;
});
console.log(JSON.stringify(res));
await browser.close();
