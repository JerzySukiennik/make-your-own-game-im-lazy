/* Review: Haiku's questions (coloured by who drew the assets) and the final evaluation. */
import { h, fill, toast, textColor } from "../util.js";
import { CFG } from "../config.js";
import { snapshot } from "../flow.js";

export function reviewView(app, room, hooks) {
  const box = h("div", { class: "pad" });
  const round = () => room.meta.round || 1;
  const cur = () => room.review["r" + round()] || {};
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  function addressees(q) {
    const map = {};
    for (const a of snapshot(room, false)) map[a.slug] = a.id;
    const ids = new Set();
    for (const s of q.to || []) if (map[s]) room.authorsOf(map[s]).forEach((p) => ids.add(p));
    if (!ids.size) room.activePlayers().forEach((p) => ids.add(p.id));
    return Array.from(ids);
  }

  function qCard(q) {
    const to = addressees(q);
    const ans = (room.answers["r" + round()] || {})[q.id] || {};
    const mine = ans[room.me.id];
    const cols = to.map((p) => room.colorOf(p));
    const stripe = cols.length > 1 ? `linear-gradient(${cols.map((c, i) => `${c} ${(i * 100) / cols.length}% ${((i + 1) * 100) / cols.length}%`).join(",")})` : cols[0] || "#888";
    const input = h("input", { type: "text", maxlength: 120, placeholder: "or type your own answer", value: mine && !q.options.includes(mine) ? mine : "" });
    const send = (v) => { if (!v.trim()) return; room.b.set(`${room.p}/ans/r${round()}/${q.id}/${room.me.id}`, v.trim().slice(0, 120)); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(input.value); });
    return h("div", { class: "qcard" },
      h("div", { class: "qstripe", style: { background: stripe } }),
      h("div", { class: "qbody" },
        h("div", { class: "qto" }, "Question for ", to.map((p, i) => [i ? (i === to.length - 1 ? " and " : ", ") : "", h("b", { class: "pn", style: { background: room.colorOf(p), color: textColor(room.colorOf(p)) } }, room.nameOf(p))])),
        h("div", { class: "qtext" }, q.text),
        h("div", { class: "qopts" }, q.options.map((o) => h("button", { class: "btn s" + (mine === o ? " on" : ""), onclick: () => send(o) }, o))),
        h("div", { class: "row2" }, input, h("button", { class: "btn s", onclick: () => send(input.value) }, "Answer")),
        h("div", { class: "qans" }, Object.entries(ans).map(([p, v]) => h("span", { class: "ans", style: { borderColor: room.colorOf(p) } }, h("b", { style: { color: room.colorOf(p) } }, room.nameOf(p) + ": "), v)))));
  }

  function render() {
    const r = cur(), host = room.isHost();
    if (!r.status || r.status === "asking") {
      fill(box, h("div", { class: "center" }, h("div", { class: "spinner" }), h("div", { class: "bigtxt" }, "Haiku is looking at everything..."), h("p", { class: "hint" }, "Reading the description and all " + room.assetCount() + " drawings.")));
    } else if (r.status === "answering") {
      const ask = parse(r.ask) || { questions: [] };
      const done = ask.questions.every((q) => Object.keys(((room.answers["r" + round()] || {})[q.id]) || {}).length);
      fill(box, 
        h("div", { class: "bigtxt" }, "Haiku has some questions"),
        h("p", { class: "hint" }, "Anyone can answer, but the people who drew the asset are asked first."),
        ...ask.questions.map(qCard),
        host ? h("div", { class: "row2" },
          h("button", { class: "btn huge", disabled: !done, onclick: hooks.continue }, "Continue"),
          h("button", { class: "btn", onclick: hooks.continue }, "Skip the rest")) : h("p", { class: "hint" }, `${room.nameOf(room.hostId())} (host) presses Continue when you are done answering.`));
    } else if (r.status === "evaluating") {
      fill(box, h("div", { class: "center" }, h("div", { class: "spinner" }), h("div", { class: "bigtxt" }, "Haiku is judging the whole idea..."), h("p", { class: "hint" }, "What works, and what is missing.")));
    } else if (r.status === "error") {
      fill(box, h("div", { class: "center" }, h("div", { class: "bigtxt" }, "The AI hit a problem"), h("div", { class: "err" }, r.err || "Unknown error"),
        host ? h("div", { class: "row2" }, h("button", { class: "btn big", onclick: hooks.retry }, "Try again"), h("button", { class: "btn", onclick: () => hooks.back(false) }, "Back to drawing"), h("button", { class: "btn", onclick: hooks.build }, "Build anyway")) : h("p", { class: "hint" }, "The host can retry.")));
    } else if (r.status === "done") {
      const ev = parse(r.eval) || { missing: [], tips: [] };
      const can = round() < CFG.maxRounds;
      fill(box, 
        h("div", { class: "evalhead" },
          h("div", { class: "score s" + (ev.score >= 8 ? "hi" : ev.score >= 5 ? "mid" : "lo") }, ev.score, h("small", null, "/10")),
          h("div", null, h("div", { class: "bigtxt" }, ev.verdict), h("p", { class: "hint" }, ev.summary))),
        ev.missing.length ? h("div", { class: "missing" }, h("h3", null, "What is missing"), ev.missing.map((m) => h("div", { class: "mrow" }, h("b", null, m.name), h("span", null, " " + m.why), m.label ? h("em", null, " [" + m.label + "]") : null))) : h("p", { class: "ok" }, "Nothing important is missing."),
        ev.tips && ev.tips.length ? h("ul", { class: "tips" }, ev.tips.map((t) => h("li", null, t))) : null,
        room.meta.ai && ev.missing.length ? h("p", { class: "hint" }, "Haiku will draw the missing things itself when you build (AI assets switch is ON).") : null,
        host ? h("div", { class: "row2" },
          can ? h("button", { class: "btn big", onclick: () => hooks.back(true) }, ev.missing.length ? "Back to drawing (add the missing things)" : "Back to drawing") : null,
          h("button", { class: "btn huge", onclick: hooks.build }, "Build the game!")) : h("p", { class: "hint" }, `Waiting for ${room.nameOf(room.hostId())} (host) to decide.`),
        !can ? h("p", { class: "hint" }, "That was the last review round. You can still rebuild after playing.") : null);
    }
  }
  const offs = [room.on("review", render), room.on("answers", render), room.on("players", render), room.on("meta", render)];
  render();
  const el = h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "HAIKU'S REVIEW  -  ROUND " + round()), box);
  return { el, destroy() { offs.forEach((o) => o()); } };
}
