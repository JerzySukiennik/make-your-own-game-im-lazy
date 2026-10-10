import { h, fill } from "../util.js";
import { unlockBox } from "./unlock.js";

export function buildView(app, room, hooks) {
  const logEl = h("div", { class: "loglines" });
  const actions = h("div", { class: "row2" });
  const spinner = h("div", { class: "spinner" });
  const title = h("div", { class: "bigtxt" }, "Haiku is building your game...");
  const lines = [];
  const unsub = room.b.on(room.p + "/build/log", "child_added", (v) => {
    lines.push(v.m);
    logEl.replaceChildren(...lines.map((m, i) => h("div", { class: "ll" + (i === lines.length - 1 ? " last" : "") }, (i === lines.length - 1 ? "> " : "  ") + m)));
  });
  function state() {
    const b = room.build || {};
    if (b.status === "error") {
      spinner.style.display = "none";
      title.textContent = "Something broke";
      fill(actions, 
        h("div", { class: "err" }, b.err || "Unknown error"),
        b.code === "games" ? (room.isHost() ? unlockBox(() => {}) : h("p", { class: "hint" }, "Only the host's code counts: " + room.nameOf(room.hostId()) + " has to enter it.")) : null,
        room.isHost() ? h("button", { class: "btn big", onclick: hooks.retry }, "Try again") : h("span", { class: "hint" }, "The host can retry."),
        room.isHost() ? h("button", { class: "btn", onclick: hooks.back }, "Back to drawing") : null);
    } else { spinner.style.display = ""; title.textContent = "Haiku is building your game..."; fill(actions, ); }
  }
  const off = room.on("build", state);
  state();
  const el = h("div", { class: "win buildwin" },
    h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "BUILDING"),
    h("div", { class: "pad center" }, spinner, title, h("p", { class: "hint" }, "Reading your drawings, writing code, testing it, fixing bugs. This takes about a minute."), logEl, actions));
  return { el, destroy() { off(); unsub(); } };
}
