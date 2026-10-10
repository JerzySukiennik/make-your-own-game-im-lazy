/* Dev server: static files (no cache) + the Worker API on the same origin. Reads .env. No key in .env = mock AI. */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import worker from "../worker/src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = parseInt(process.env.PORT || process.argv[2] || "5190", 10);

const env = {};
try {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (e) {}
if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.includes("PASTE")) { delete env.ANTHROPIC_API_KEY; env.MOCK = "1"; }
console.log(env.ANTHROPIC_API_KEY ? "AI: real Anthropic key loaded" : "AI: MOCK mode (no key in .env)");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".gif": "image/gif", ".woff2": "font/woff2" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:" + port);
  if (req.method === "POST" && url.pathname.startsWith("/__save/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const name = path.basename(url.pathname);
    fs.mkdirSync(path.join(root, "Niepotrzebne"), { recursive: true });
    fs.writeFileSync(path.join(root, "Niepotrzebne", name), Buffer.concat(chunks));
    res.writeHead(200); res.end("saved");
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const r = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const out = await worker.fetch(r, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log("MYOG dev server on http://localhost:" + port));
