import { createRequire } from "module";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5190/");
const res = await page.evaluate(async () => {
  const { mountGame } = await import("/src/game/host.js");
  const code = `G.start({init(){}, update(){ if (G.frame === 10) parent.postMessage({t:"warn",msg:"f10"},"*"); if (G.frame === 30) { parent.postMessage({t:"warn",msg:"navigating"},"*"); location.href = "https://example.com/"; } }, draw(c){ c.fillStyle="#123"; c.fillRect(0,0,1280,720);} });`;
  const msgs = [];
  const holder = document.createElement("div"); holder.style.cssText = "width:640px;height:360px;position:relative"; document.body.append(holder);
  await mountGame(holder, { title: "t", manifest: { assets: {} }, assets: [], code }, { players: [{ id: "a", name: "A", color: "#f00", index: 0 }], me: "a", hostId: "a", seed: 1 }, (m) => msgs.push(m));
  window.__msgs = msgs; window.__holder = holder;
  return "mounted";
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.__holder.scrollIntoView()); const bb = await page.evaluate(() => { const r = window.__holder.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.mouse.click(bb[0], bb[1]);
await page.waitForTimeout(1500); await page.screenshot({path:"/private/tmp/claude-501/-Users-jurek-Downloads-Claude-Projects/21abf3de-6b87-4753-b1ce-e34902467738/scratchpad/nav.png"}); await page.waitForTimeout(3000);
for (const f0 of page.frames()) if (f0 !== page.mainFrame()) { try { await f0.evaluate(() => window.dispatchEvent(new PointerEvent("pointerdown"))); await page.waitForTimeout(2500); console.log("after synthetic click", JSON.stringify(await f0.evaluate(() => ({ fr: G.frame })))); } catch (e) { console.log("frame gone:", e.message.slice(0, 60)); } }
for (const f of []) { if (f !== page.mainFrame()) { try { console.log("frame url", f.url().slice(0, 40), JSON.stringify(await f.evaluate(() => ({ fr: G.frame, t: G.time, w: window.innerWidth, h: window.innerHeight, cw: G.canvas.width })))); } catch (e) { console.log("frame err", e.message.slice(0, 80)); } } }
const out = await page.evaluate(() => ({ msgs: window.__msgs.map((m) => m.t + ":" + (m.msg || "")), frames: window.__holder.querySelectorAll("iframe").length }));
console.log(res, JSON.stringify(out));
await browser.close();
