import { h, toast } from "../util.js";
import { mountGame } from "../game/host.js";
import { bridge } from "../game/bridge.js";
import { publish } from "../flow.js";

export function playView(app, room, hooks) {
  const stage = h("div", { class: "stage" });
  const status = h("div", { class: "playstat" });
  let game = null, br = null, errs = [], dead = false;
  let pkg = null;

  async function start() {
    if (!room.game || !room.game.pkg) { stage.replaceChildren(h("p", { class: "err" }, "No game yet.")); return; }
    try { pkg = JSON.parse(room.game.pkg); } catch (e) { stage.replaceChildren(h("p", { class: "err" }, "The saved game is broken.")); return; }
    const gen = room.meta.gen || 1;
    const players = room.playerList();
    game = await mountGame(stage, pkg, { players, me: room.me.id, hostId: room.hostId(), seed: gen * 7919 + 13 }, (m) => {
      if (m.t === "err") { errs.push(m.msg); status.textContent = "Game error: " + m.msg; status.className = "playstat bad"; }
      else if (m.t === "ready") { setTimeout(() => game && game.focus(), 100); }
      else if (br) br.handle(m);
    });
    if (dead) { game.destroy(); return; }
    br = bridge(room, game, gen, room.meta.solo);
    game.send({ t: "players", list: players, hostId: room.hostId() });
    game.focus();
  }

  const host = () => room.isHost();
  const bar = h("div", { class: "playbar" },
    h("b", { class: "gtitle" }, room.game ? room.game.title : "Game"),
    h("span", { class: "hint" }, "Click the game once, then play."),
    h("span", { class: "sp" }),
    h("button", { class: "btn", onclick: async () => {
      const t = prompt("Name for the gallery:", room.game.title);
      if (t === null) return;
      try { await publish(room, t); toast("Published to the Gallery!"); } catch (e) { toast(e.message); }
    } }, "Publish to gallery"),
    h("button", { class: "btn", onclick: () => { if (!host()) { toast("Only the host can restart"); return; } hooks.restart(); } }, "Restart"),
    h("button", { class: "btn big", onclick: () => { if (!host()) { toast("Only the host can start editing"); return; } hooks.edit(); } }, "Edit & rebuild"));

  const offG = room.on("game", () => {});
  start();
  const el = h("div", { class: "playwrap" }, bar, stage, status);
  return { el, destroy() { dead = true; offG(); if (br) br.destroy(); if (game) game.destroy(); } };
}
