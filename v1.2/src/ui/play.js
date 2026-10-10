import { h, toast } from "../util.js";
import { FEEDBACK } from "../feedback.js";
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
    h("button", { class: "btn", onclick: () => openFeedback() }, "Feedback"),
    h("button", { class: "btn", onclick: () => { if (!host()) { toast("Only the host can restart"); return; } hooks.restart(); } }, "Restart"),
    h("button", { class: "btn big", onclick: () => { if (!host()) { toast("Only the host can start editing"); return; } hooks.edit(); } }, "Edit & rebuild"));

  function openFeedback() {
    if (document.querySelector(".fb-back")) return;
    const picked = new Set();
    const text = h("textarea", { rows: 3, maxlength: 500, placeholder: "Anything else? e.g. \"the red player is invisible\" or \"apples are too small\"" });
    const back = h("div", { class: "fb-back" });
    const close = () => back.remove();
    const send = h("button", { class: "btn huge", onclick: async () => {
      if (!picked.size && !text.value.trim()) { toast("Pick at least one thing or write a line"); return; }
      send.disabled = true;
      const diag = [];
      if (errs.length) diag.push("Runtime errors seen while playing: " + errs.slice(0, 4).join(" | "));
      diag.push(`Players in the room: ${room.playerList().length}${room.meta.solo ? " (single player)" : ""}.`);
      const lines = [...picked].map((k) => FEEDBACK.find((f) => f.id === k).hint);
      if (text.value.trim()) lines.push("In the players' words: " + text.value.trim());
      lines.push(diag.join(" "));
      close();
      await hooks.feedback(lines.join(" "));
    } }, "Send and let Haiku fix it");
    const chips = h("div", { class: "fb-chips" }, FEEDBACK.map((f) => h("button", { class: "chip-btn fb", onclick: (e) => { if (picked.has(f.id)) { picked.delete(f.id); e.target.classList.remove("on"); } else { picked.add(f.id); e.target.classList.add("on"); } } }, f.label)));
    back.append(h("div", { class: "win fb" },
      h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "WHAT IS WRONG WITH THE GAME?", h("button", { class: "x", onclick: close }, "X")),
      h("div", { class: "pad" }, h("p", { class: "hint" }, "Tap everything that applies. Haiku reads it, fixes the game and starts it again."), chips, text, h("div", { class: "row2" }, send, h("button", { class: "btn", onclick: close }, "Cancel")))));
    document.body.append(back);
  }

  const offG = room.on("game", () => {});
  start();
  const el = h("div", { class: "playwrap" }, bar, stage, status);
  return { el, destroy() { dead = true; offG(); if (br) br.destroy(); if (game) game.destroy(); } };
}
