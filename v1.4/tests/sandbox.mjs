import { createRequire } from "module";
const require = createRequire("/Users/jurek/Downloads/Claude/Projects/Now In The Future/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5190/");
const res = await page.evaluate(async () => {
  const { mountGame } = await import("/src/game/host.js");
  const code = `
    const out = {};
    const tries = {
      fetch: () => fetch("https://example.com").then(() => "REACHED", (e) => "blocked"),
      xhr: () => new Promise((r) => { try { const x = new XMLHttpRequest(); x.open("GET", "https://example.com"); x.onload = () => r("REACHED"); x.onerror = () => r("blocked"); x.send(); } catch (e) { r("blocked:" + e.name); } }),
      img: () => new Promise((r) => { const i = new Image(); i.onload = () => r("REACHED"); i.onerror = () => r("blocked"); i.src = "https://example.com/favicon.ico?x=" + Math.random(); }),
      parent: () => { try { return "REACHED " + parent.document.title; } catch (e) { return "blocked"; } },
      storage: () => { try { localStorage.setItem("a", "b"); return "REACHED"; } catch (e) { return "blocked"; } },
      cookie: () => { try { document.cookie = "a=b"; return document.cookie ? "REACHED" : "blocked"; } catch (e) { return "blocked"; } },
      top: () => { try { top.location.href = "https://example.com"; return "MAYBE"; } catch (e) { return "blocked"; } },
      ws: () => { try { new WebSocket("wss://example.com"); return "MAYBE"; } catch (e) { return "blocked"; } }
    };
    (async () => { for (const k in tries) out[k] = await tries[k](); G.warn_out = out; })();
    G.start({ init() {}, update() { if (G.frame === 5) window.__r = out; }, draw(c) { c.fillStyle = "#123"; c.fillRect(0, 0, 1280, 720); c.fillStyle = "#fff"; c.fillText(JSON.stringify(out), 10, 20); } });
    setTimeout(() => parent.postMessage({ t: "warn", msg: "SANDBOX " + JSON.stringify(out) }, "*"), 1500);
  `;
  const pkg = { title: "t", manifest: { assets: {} }, assets: [], code };
  const msgs = [];
  const holder = document.createElement("div"); holder.style.cssText = "width:640px;height:360px;position:relative"; document.body.append(holder);
  await mountGame(holder, pkg, { players: [{ id: "a", name: "A", color: "#f00", index: 0 }], me: "a", hostId: "a", seed: 1 }, (m) => msgs.push(m));
  await new Promise((r) => setTimeout(r, 4000));
  return msgs.filter((m) => m.t === "warn" || m.t === "err");
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
