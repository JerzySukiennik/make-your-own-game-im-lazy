/* Make Your Own Game API: a thin proxy in front of the Anthropic Messages API.
   The key lives in the Worker secret ANTHROPIC_API_KEY and never reaches the browser.
   Prompts live here, so visitors cannot use this as a free general-purpose proxy. */

import { SYSTEM_CODE, SYSTEM_REPAIR, SYSTEM_REBUILD, SYSTEM_ASK, SYSTEM_EVAL, SYSTEM_SVG, SYSTEM_QA } from "./prompts.mjs";
import { mock } from "./mock.mjs";

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const PRICE = { [HAIKU]: [0.10, 0.50], [SONNET]: [2, 10] };
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?gzowo\.fun$/, /^https:\/\/[a-z0-9-]+\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MAX_BODY = 6_000_000;

const memory = new Map();
async function kvGet(env, k) { if (env.LIMITS) return parseFloat((await env.LIMITS.get(k)) || "0"); return memory.get(k) || 0; }
async function kvPut(env, k, v) { if (env.LIMITS) return env.LIMITS.put(k, String(v), { expirationTtl: 172800 }); memory.set(k, v); }

function day() { return new Date().toISOString().slice(0, 10); }
function cors(req) {
  const o = req.headers.get("origin") || "";
  const ok = ORIGINS.some((r) => r.test(o));
  return {
    "access-control-allow-origin": ok ? o : "https://gzowo.fun",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "vary": "origin"
  };
}
function json(req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ "content-type": "application/json" }, cors(req)) });
}

function assetBlocks(assets, tell) {
  const out = [];
  for (const a of assets || []) {
    const meta = [
      `ASSET "${a.slug}"`, a.name && a.name !== a.slug ? `(called "${a.name}")` : "",
      a.label ? `role: ${a.label}${a.owner ? " of " + a.owner : ""}` : (a.owner ? `drawn by ${a.owner}` : ""),
      `aspect ${a.aspect ? Number(a.aspect).toFixed(2) : "1"} (w/h)`,
      a.hasRig ? `rigged limbs: ${(a.rigRoles || []).join(",")}` : "",
      a.hasSound ? "has a recorded sound" : "", a.ai ? "AI-made placeholder" : ""
    ].filter(Boolean).join(" | ");
    out.push({ type: "text", text: meta + `\nDescription: ${a.desc || "(none)"}` });
    if (tell !== false && a.img && /^data:image\/(png|jpeg);base64,/.test(a.img) && a.img.length < 160000) {
      const m = a.img.match(/^data:(image\/(?:png|jpeg));base64,(.*)$/);
      out.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    }
  }
  return out;
}

function taskText(p) {
  const players = (p.players || []).map((x) => `${x.name}${x.isHost ? " (host)" : ""}`).join(", ");
  const qa = (p.qa || []).map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n");
  return [
    `GAME DESCRIPTION (written together by the players):\n${String(p.prompt || "").slice(0, 1500) || "(empty: invent a fitting game from the drawings)"}`,
    `PLAYERS (${(p.players || []).length}): ${players || "1 player"}`,
    qa ? `PLAYER ANSWERS TO YOUR QUESTIONS:\n${qa.slice(0, 3000)}` : "",
    p.prevPrompt && p.prevPrompt !== p.prompt ? `THE DESCRIPTION CHANGED since the last version. Previous description: ${String(p.prevPrompt).slice(0, 1200)}\nApply what changed, and treat any problem the players mention as a bug report to fix first.` : "",
    p.eval ? `REVIEW NOTES:\n${JSON.stringify(p.eval).slice(0, 2000)}` : "",
    (p.feedback || []).length ? `PLAYER FEEDBACK ON THE CURRENT VERSION (fix these problems FIRST, they come from people who just played it):\n${(p.feedback || []).map((f) => "- " + String(f).slice(0, 700)).join("\n").slice(0, 4000)}` : "",
    p.aiAssets ? "Some assets are AI-made placeholders (marked)." : ""
  ].filter(Boolean).join("\n\n");
}

async function claude(env, model, system, content, maxTokens, effort) {
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: "user", content }], output_config: { effort } };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || "Anthropic error " + r.status), { status: r.status });
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const u = j.usage || {};
  const p = PRICE[model] || [2, 10];
  const usd = ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[0] * .1) / 1e6;
  return { text, usd, stop: j.stop_reason, usage: u };
}

async function codeCall(env, model, system, content, effort) {
  const first = await claude(env, model, system, content, 32000, effort);
  let usd = first.usd;
  try { return Object.assign(parseCode(first.text), { usd, stop: first.stop, model }); } catch (e) { /* retry below */ }
  const nudge = [{ type: "text", text: "IMPORTANT: your previous attempt produced no usable program (it ran out of room). Think only briefly, keep the program compact (about 500 lines at most), and output the <manifest> and <code> sections right away." }];
  const second = await claude(env, model, system, content.concat(nudge), 32000, "low");
  usd += second.usd;
  try { return Object.assign(parseCode(second.text), { usd, stop: second.stop, model }); } catch (e) {
    throw new Error(`The AI could not finish the program (stop=${second.stop}, ${second.usage.output_tokens} tokens). Try a simpler description.`);
  }
}

function parseJSON(t) {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("model returned no JSON");
  return JSON.parse(m[0]);
}
function parseCode(t) {
  const man = t.match(/<manifest>([\s\S]*?)<\/manifest>/i);
  let code = t.match(/<code>([\s\S]*?)<\/code>/i);
  let src = code ? code[1] : (t.match(/<code>([\s\S]*)$/i) || [])[1];
  if (!src) throw new Error("model returned no <code> section");
  src = src.replace(/^\s*```(?:javascript|js)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let manifest = {};
  try { manifest = man ? JSON.parse(man[1]) : {}; } catch (e) { manifest = {}; }
  return { code: src, manifest };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const path = url.pathname.replace(/\/+$/, "");
    const budget = parseFloat(env.DAILY_USD || "3");
    const perIpGames = parseInt(env.GAMES_PER_IP || "3", 10);
    const isMock = !env.ANTHROPIC_API_KEY && env.MOCK === "1";

    if (path === "/api/health") {
      const spent = await kvGet(env, "usd:" + day());
      return json(req, { ok: true, mock: isMock, haveKey: !!env.ANTHROPIC_API_KEY, spent: +spent.toFixed(4), budget });
    }
    if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
    const stage = path.replace("/api/", "");
    if (!["ask", "eval", "svg", "code", "repair", "qa"].includes(stage)) return json(req, { error: "unknown stage" }, 404);
    if (!isMock && !env.ANTHROPIC_API_KEY) return json(req, { error: "The AI is not switched on yet (no API key on the server)." }, 503);

    const origin = req.headers.get("origin") || "";
    if (origin && !ORIGINS.some((r) => r.test(origin))) return json(req, { error: "origin not allowed" }, 403);
    const len = parseInt(req.headers.get("content-length") || "0", 10);
    if (len > MAX_BODY) return json(req, { error: "request too large" }, 413);
    let p;
    try { p = await req.json(); } catch (e) { return json(req, { error: "bad json" }, 400); }

    const ip = req.headers.get("cf-connecting-ip") || "local";
    const d = day();
    const spent = await kvGet(env, "usd:" + d);
    if (!isMock && spent >= budget) return json(req, { error: "The daily AI budget is used up. Come back tomorrow! Games in the gallery still work.", code: "budget" }, 429);
    const calls = await kvGet(env, `ip:${ip}:${d}:calls`);
    if (!isMock && calls >= 80) return json(req, { error: "Too many AI calls from your connection today.", code: "ip" }, 429);
    const countsAsGame = stage === "code" && !p.free && !isMock;
    if (countsAsGame) {
      const g = await kvGet(env, `ip:${ip}:${d}:games`);
      if (g >= perIpGames) return json(req, { error: `Limit: ${perIpGames} new games per day from one connection. Rebuilding by fixing bugs is free.`, code: "games" }, 429);
      await kvPut(env, `ip:${ip}:${d}:games`, g + 1);
    }
    await kvPut(env, `ip:${ip}:${d}:calls`, calls + 1);

    const work = async () => { try {
      let out, usd = 0, model = HAIKU;
      const assets = (p.assets || []).slice(0, 40);
      const base = [{ type: "text", text: taskText(p) }, ...assetBlocks(assets)];
      if (isMock) {
        out = mock(stage, p);
      } else if (stage === "ask") {
        const r = await claude(env, HAIKU, SYSTEM_ASK, base, 4000, "low");
        usd = r.usd; out = parseJSON(r.text);
      } else if (stage === "eval") {
        const r = await claude(env, HAIKU, SYSTEM_EVAL, base, 5000, "low");
        usd = r.usd; out = parseJSON(r.text);
      } else if (stage === "svg") {
        const want = (p.missing || []).slice(0, 8).map((m) => `- ${String(m.name).slice(0, 40)}: ${String(m.desc || "").slice(0, 200)}`).join("\n");
        const r = await claude(env, HAIKU, SYSTEM_SVG, [...base, { type: "text", text: "Draw these missing assets:\n" + want }], 9000, "low");
        usd = r.usd; out = parseJSON(r.text);
      } else if (stage === "qa") {
        const shots = (p.calm || []).slice(0, 2).flatMap((s, i) => {
          const m = String(s).match(/^data:(image\/jpeg);base64,(.*)$/);
          return m && m[2].length < 140000 ? [{ type: "text", text: i ? "Screenshot at 0.8 s:" : "Screenshot at 0.25 s:" }, { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }] : [];
        });
        const r = await claude(env, HAIKU, SYSTEM_QA, [...base.filter((b) => b.type === "text"), ...shots, { type: "text", text: "Measured by the engine: " + String(p.measure || "").slice(0, 600) }], 2500, "low");
        usd = r.usd; out = parseJSON(r.text);
      } else if (stage === "code") {
        const rebuild = p.rebuild && p.rebuild.code;
        const ask = [...base, { type: "text", text: rebuild
          ? `PREVIOUS PROGRAM TO UPDATE:\n<manifest>${JSON.stringify(p.rebuild.manifest || {})}</manifest>\n<code>\n${String(p.rebuild.code).slice(0, 60000)}\n</code>\n\nUpdate it for the task above.`
          : "Build the game now." }];
        out = await codeCall(env, HAIKU, rebuild ? SYSTEM_REBUILD : SYSTEM_CODE, ask, "low");
        usd = out.usd; delete out.usd;
      } else if (stage === "repair") {
        model = p.escalate ? SONNET : HAIKU;
        const rep = p.report || {};
        const content = [
          ...base,
          { type: "text", text: `CURRENT MANIFEST:\n${JSON.stringify(p.manifest || {})}\n\nCURRENT CODE:\n<code>\n${String(p.code || "").slice(0, 70000)}\n</code>\n\nTEST REPORT (the game ran headless for ${rep.steps || 900} frames with random keyboard/mouse input):\n${JSON.stringify({ errors: rep.errors, frozen: rep.frozen, blank: rep.blank, warnings: rep.warns, keysUsed: rep.keys, note: rep.note }).slice(0, 4000)}\n\nFix every problem and return the complete corrected program.` }
        ];
        for (const s of (rep.shots || []).slice(-1)) {
          const m = String(s).match(/^data:(image\/jpeg);base64,(.*)$/);
          if (m && m[2].length < 120000) content.push({ type: "text", text: "Screenshot of the game at the end of the test:" }, { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
        }
        out = await codeCall(env, model, SYSTEM_REPAIR, content, p.escalate ? "medium" : "low");
        usd = out.usd; delete out.usd;
      }
      if (usd) await kvPut(env, "usd:" + d, (await kvGet(env, "usd:" + d)) + usd);
      return { status: 200, body: { ok: true, stage, usd: +usd.toFixed(5), ...out } };
    } catch (e) {
      return { status: e.status === 529 ? 503 : 502, body: { error: String(e.message || e).slice(0, 300) } };
    } };

    if (stage !== "code" && stage !== "repair") { const r = await work(); return json(req, r.body, r.status); }
    /* long stages: answer immediately and send whitespace heartbeats so no proxy cuts the connection */
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctrl) {
        const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(" ")); } catch (e) {} }, 8000);
        ctrl.enqueue(enc.encode(" "));
        const r = await work();
        clearInterval(beat);
        ctrl.enqueue(enc.encode(JSON.stringify(r.body)));
        ctrl.close();
      }
    });
    return new Response(stream, { status: 200, headers: Object.assign({ "content-type": "application/json" }, cors(req)) });
  }
};
