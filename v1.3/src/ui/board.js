/* The main drawing board: shared game description, asset cards, Done. */
import { h, toast, debounce, textColor } from "../util.js";
import { CFG } from "../config.js";
import { promptBox } from "./promptbox.js";
import { openEditor } from "./editor.js";
import { readiness } from "../flow.js";

export function boardView(app, room) {
  const pb = promptBox(room);
  const grid = h("div", { class: "cards" });
  const bar = h("div", { class: "donebar" });
  const cards = {};
  let editor = null;

  function thumb(id) {
    const c = h("canvas", { width: 220, height: 220, class: "thumb" });
    drawThumb(c, id);
    return c;
  }
  function drawThumb(c, id) {
    const g = c.getContext("2d");
    g.clearRect(0, 0, 220, 220);
    const a = room.art(id);
    if (!a) return;
    if (a.kind !== "svg" && !(a.strokes && a.strokes.length)) a.strokes = room.strokesOf(id);
    const has = a.kind === "svg" ? !!a.svg : a.strokes.length > 0;
    if (!has) { g.fillStyle = "#999"; g.font = "14px Verdana"; g.textAlign = "center"; g.fillText("empty", 110, 114); return; }
    Art.invalidate(a);
    if (a.kind !== "svg") a.strokes = room.strokesOf(id);
    const run = () => {
      const bb = a.bb || Art.tightBounds(a);
      if (!bb) return;
      a.bb = bb;
      const asp = bb[2] / bb[3];
      let w = 190, hh = w / asp;
      if (hh > 190) { hh = 190; w = hh * asp; }
      Art.drawAsset(g, a, 110, 110, w, hh, {});
    };
    if (a.kind === "svg" && !a.img) Art.prepare(a).then(() => { Art.invalidate(a); run(); }); else run();
  }

  function card(id) {
    const a = room.assets[id];
    const authors = room.authorsOf(id);
    const needs = !(a.desc || "").trim();
    const el = h("div", { class: "card" + (needs ? " needs" : ""), onclick: () => open(id) },
      h("div", { class: "thumb-wrap" }, thumb(id), a.ai ? h("span", { class: "badge ai" }, "AI") : null, a.kind === "pixel" ? h("span", { class: "badge px" }, "PIXEL") : null, a.snd ? h("span", { class: "badge snd" }, "SND") : null,
        a.rig && a.rig.points && a.rig.points.length ? h("span", { class: "badge rig" }, "RIG") : null),
      h("div", { class: "cname" }, a.name || "Asset"),
      a.label ? h("div", { class: "role r-" + a.label }, { avatar: "avatar", cursor: "cursor", bg: "background" }[a.label]) : null,
      h("div", { class: "cdesc" }, needs ? "needs a description" : a.desc),
      h("div", { class: "who" }, authors.map((p) => h("span", { class: "dot", title: room.nameOf(p), style: { background: room.colorOf(p), color: textColor(room.colorOf(p)) } }, room.nameOf(p).slice(0, 1).toUpperCase()))));
    return el;
  }

  function open(id) {
    if (editor) editor.close();
    editor = openEditor(room, id, () => { editor = null; refreshCards(); });
  }

  async function add(kind) {
    try { const id = await room.newAsset(kind); await new Promise((r) => setTimeout(r, 60)); open(id); } catch (e) { toast(e.message); }
  }

  const refreshCards = () => {
    const ids = Object.keys(room.assets).sort((x, y) => (room.assets[x].created || 0) - (room.assets[y].created || 0));
    const frag = ids.map((id) => card(id));
    grid.replaceChildren(...frag,
      h("button", { class: "card add", onclick: () => add("vector"), disabled: room.assetCount() >= CFG.maxAssets }, h("b", null, "+"), "New drawing", h("small", null, "vector, any size")),
      h("button", { class: "card add px", onclick: () => add("pixel") }, h("b", null, "+"), "New pixel art", h("small", null, "64 x 64 cells")));
    renderBar();
  };
  const refreshSoft = debounce(refreshCards, 250);

  function renderBar() {
    const me = room.players[room.me.id] || {};
    const ready = !!me.ready;
    const list = room.activePlayers();
    const rd = readiness(room);
    const aiBox = h("label", { class: "chk ai-toggle" + (room.isHost() ? "" : " dis") },
      h("input", { type: "checkbox", checked: !!(room.meta && room.meta.ai), disabled: !room.isHost(), onchange: (e) => room.setMeta({ ai: e.target.checked }) }),
      " Let Haiku draw missing assets ", h("small", null, room.isHost() ? "(off = you draw everything)" : "(host decides)"));
    bar.replaceChildren(
      h("div", { class: "left" }, aiBox,
        h("div", { class: "hint" }, `${room.assetCount()} / ${CFG.maxAssets} assets` + (room.meta && room.meta.rebuild ? " | editing the existing game" : ` | round ${room.meta ? room.meta.round : 1} / ${CFG.maxRounds}`))),
      h("div", { class: "right" },
        h("div", { class: "readyrow" }, list.map((p) => h("span", { class: "rd" + (p.ready ? " on" : ""), style: { borderColor: p.color } }, h("i", { style: { background: p.ready ? p.color : "transparent" } }), p.name))),
        h("button", { class: "btn huge" + (ready ? " on" : ""), onclick: async () => {
          if (!ready && !rd.ok) { toast(rd.why, 4200); return; }
          await room.setReady(!ready);
        } }, ready ? "Not done yet" : "DONE")));
  }

  const offA = room.on("assets", (e) => { if (e.why === "stroke") { refreshSoft(); } else refreshCards(); });
  const offP = room.on("players", renderBar);
  const offM = room.on("meta", renderBar);
  refreshCards();

  const el = h("div", { class: "board" },
    h("div", { class: "win pbwin" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "WHAT GAME IS THIS? (everyone can type at the same time)"), h("div", { class: "pad" }, pb.el)),
    h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "THE STUFF IN YOUR GAME (click one to draw)"), h("div", { class: "pad" }, grid)),
    bar);
  return { el, destroy() { offA(); offP(); offM(); pb.destroy(); if (editor) editor.close(); } };
}
