/* A room: header + the screen for the current phase, plus the host's automation. */
import { h, fill, toast, textColor } from "../util.js";
import { CFG } from "../config.js";
import { boardView } from "./board.js";
import { reviewView } from "./review.js";
import { buildView } from "./build.js";
import { playView } from "./play.js";
import { readiness, startReview, runEval, runBuild } from "../flow.js";

export function roomView(app, { room }) {
  const content = h("div", { class: "room-content" });
  const head = h("div", { class: "roomhead" });
  let view = null, shown = null, busy = false;

  function renderHead() {
    const hid = room.hostId();
    const solo = room.meta && room.meta.solo;
    fill(head, 
      h("div", { class: "rh-left" },
        solo ? h("b", { class: "solo" }, "SINGLE PLAYER") : h("button", { class: "roomcode", title: "Copy invite link", onclick: () => {
          const u = location.origin + location.pathname + "#/room/" + room.code;
          navigator.clipboard && navigator.clipboard.writeText(u); toast("Invite link copied: " + room.code);
        } }, "ROOM ", h("b", null, room.code), h("small", null, " click to copy link")),
        room.meta && room.meta.name ? h("span", { class: "rname" }, room.meta.name) : null),
      h("div", { class: "rh-players" }, room.activePlayers().map((p) => h("span", { class: "pl", style: { background: p.color, color: textColor(p.color) } },
        p.id === hid ? "★ " : "", p.name,
        room.isHost() && p.id !== room.me.id ? h("i", { title: "Kick", onclick: () => { if (confirm("Kick " + p.name + "?")) room.kick(p.id); } }, " x") : null))),
      h("button", { class: "btn s", onclick: () => { if (confirm("Leave this room?")) app.leaveRoom(); } }, "Leave"));
  }

  const hooksReview = {
    continue: () => runEval(room),
    retry: () => (room.review["r" + (room.meta.round || 1)] || {}).ask ? runEval(room) : startReview(room),
    back: async (slots) => {
      const r = room.meta.round || 1;
      if (slots) {
        let ev = null; try { ev = JSON.parse((room.review["r" + r] || {}).eval || "null"); } catch (e) {}
        for (const m of (ev && ev.missing) || []) {
          if (room.assetCount() >= CFG.maxAssets) break;
          const id = await room.newAsset("vector", m.name);
          await room.patchAsset(id, { desc: m.desc || m.why || "", label: m.label || "" });
        }
      }
      await room.resetReady();
      await room.setMeta({ phase: "draw", round: Math.min(CFG.maxRounds, r + 1) });
    },
    build: async () => { await room.resetReady(); await room.setMeta({ phase: "build" }); }
  };
  const hooksBuild = {
    retry: async () => { room._building = false; await room.setMeta({ phase: "build", t: room.b.now() }); runBuildOnce(true); },
    back: async () => { await room.setMeta({ phase: "draw" }); }
  };
  const hooksPlay = {
    restart: async () => { const g = room.meta.gen || 1; await room.setMeta({ gen: g + 1 }); room.b.remove(`${room.p}/play/${g}`); },
    edit: async () => { await room.resetReady(); await room.setMeta({ phase: "draw", rebuild: true }); },
    feedback: async (text) => {
      await room.b.push(`${room.p}/feedback`, { by: room.me.id, text: String(text).slice(0, 900), t: room.b.now() });
      toast("Thanks! Haiku is fixing it...", 3000);
      await room.resetReady();
      await room.setMeta({ phase: "build", rebuild: true, fix: true });
    }
  };

  function runBuildOnce(force) {
    if (!room.isHost() || (room._building && !force)) return;
    room._building = true;
    runBuild(room).finally(() => { room._building = false; });
  }

  function show() {
    const m = room.meta;
    if (!m) return;
    const key = m.phase + (m.phase === "play" ? ":" + m.gen + ":" + (room.game ? room.game.gen : "x") : "") + (m.phase === "review" ? ":" + m.round : "") + (m.phase === "draw" ? ":" + (m.round || 1) : "");
    if (key === shown) return;
    if (m.phase === "play" && !room.game) { content.replaceChildren(h("div", { class: "pad center" }, h("div", { class: "spinner" }), h("p", { class: "hint" }, "Loading the game..."))); return; }
    shown = key;
    if (view && view.destroy) view.destroy();
    content.replaceChildren();
    if (m.phase === "draw") view = boardView(app, room);
    else if (m.phase === "review") view = reviewView(app, room, hooksReview);
    else if (m.phase === "build") view = buildView(app, room, hooksBuild);
    else if (m.phase === "play") view = playView(app, room, hooksPlay);
    if (view) content.append(view.el);
  }

  const offs = [];
  offs.push(room.on("meta", (e) => {
    renderHead(); show();
    if (!e.old || e.old.phase !== e.meta.phase) {
      if (e.meta.phase === "build") runBuildOnce();
    }
  }));
  offs.push(room.on("game", () => show()));
  offs.push(room.on("players", () => {
    renderHead();
    if (room.meta && room.meta.phase === "draw" && room.isHost() && !busy && room.allReady()) {
      const rd = readiness(room);
      if (!rd.ok) { toast(rd.why, 4500); room.resetReady(); return; }
      busy = true;
      (async () => {
        try {
          await room.resetReady();
          if (room.meta.rebuild) await room.setMeta({ phase: "build" }); else await startReview(room);
        } finally { busy = false; }
      })();
    }
  }));
  offs.push(room.on("gone", () => { toast("The room was closed"); app.leaveRoom(); }));
  offs.push(room.on("kicked", () => { toast("The host removed you from the room", 4000); app.leaveRoom(); }));
  /* watchdog: if the previous host left in the middle of a step, the new host picks it up */
  const wd = setInterval(() => {
    if (!room.meta || !room.isHost() || busy) return;
    const ph = room.meta.phase;
    if (ph === "build" && !room._building && room.build && room.build.status === "running") runBuildOnce();
    else if (ph === "review" && !room._reviewBusy) {
      const r = room.review["r" + (room.meta.round || 1)] || {};
      if (r.status === "asking") { hooksReview.retry(); }
      else if (r.status === "evaluating") { runEval(room); }
    }
  }, 12000);
  offs.push(() => clearInterval(wd));
  renderHead(); show();
  if (room.meta && room.meta.phase === "build") runBuildOnce();

  const el = h("div", { class: "frame roomframe" }, head, content);
  return { el, destroy() { offs.forEach((o) => o()); if (view && view.destroy) view.destroy(); } };
}
