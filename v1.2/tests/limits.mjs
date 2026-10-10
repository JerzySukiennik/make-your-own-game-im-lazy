import worker from "../worker/src/index.mjs";
const PASS = process.env.UNLOCK_PASS || "test-code";
const env = { ANTHROPIC_API_KEY: "bad-key-on-purpose", GAMES_PER_IP: "1", UNLOCK_PASS: PASS, DAILY_USD: "3" };
const call = async (body, pass) => {
  const r = await worker.fetch(new Request("http://x/api/code", { method: "POST", headers: Object.assign({ "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, pass ? { "x-myog-pass": pass } : {}), body: JSON.stringify(body) }), env);
  const t = (await r.text()).trim();
  const j = JSON.parse(t);
  return `${r.status} ${j.code || ""} ${(j.error || "").slice(0, 60)}`;
};
const base = { prompt: "x", assets: [], players: [] };
console.log("1st new game      :", await call(base));
console.log("2nd new game      :", await call(base));
console.log("2nd with the code :", await call(base, PASS));
console.log("2nd with wrong    :", await call(base, "1234"));
console.log("rebuild (feedback):", await call(Object.assign({ rebuild: { code: "G.start({})", manifest: {} }, feedback: ["x"] }, base)));
