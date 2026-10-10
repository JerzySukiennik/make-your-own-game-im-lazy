import { h, fill, toast } from "../util.js";

export function lobbyView(app, args) {
  let off = null, alive = true;
  const name = h("input", { type: "text", maxlength: 16, placeholder: "type your name", value: app.me.name, class: "nameinp" });
  name.addEventListener("input", () => app.setName(name.value));
  const code = h("input", { type: "text", maxlength: 4, placeholder: "CODE", class: "codeinp", value: args.code || "" });
  code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  const roomName = h("input", { type: "text", maxlength: 24, placeholder: "room name (optional)" });
  const pub = h("input", { type: "checkbox" });
  const list = h("div", { class: "rooms" }, h("p", { class: "hint" }, "Looking for rooms..."));
  const msg = h("div", { class: "err" });

  const need = () => { if (!name.value.trim()) { toast("Type your name first!"); name.focus(); return false; } app.setName(name.value.trim()); return true; };
  async function join(c) {
    if (!need()) return;
    msg.textContent = "";
    try { const room = await app.joinRoom(c); await app.openRoom(room); } catch (e) { msg.textContent = e.message; }
  }
  async function create() {
    if (!need()) return;
    msg.textContent = "";
    try { const room = await app.newRoom("firebase", { pub: pub.checked, name: roomName.value.trim() }); await app.openRoom(room); } catch (e) { msg.textContent = e.message; }
  }

  (async () => {
    try {
      const b = await app.backend("firebase");
      if (!alive) return;
      off = b.on("lobby", "value", (v) => {
        const now = b.now();
        const rows = Object.entries(v || {}).filter(([, r]) => now - (r.t || 0) < 45000 && r.n > 0).sort((x, y) => y[1].t - x[1].t);
        for (const [c, r] of Object.entries(v || {})) if (now - (r.t || 0) > 600000) b.remove("lobby/" + c);
        fill(list, rows.length ? rows.map(([c, r]) => h("div", { class: "room-row" },
          h("b", { class: "code" }, c), h("span", { class: "rn" }, r.name || "Open room"), h("span", { class: "rp" }, r.n + " / 6 players"),
          h("span", { class: "rph" }, { draw: "drawing", review: "reviewing", build: "building", play: "playing" }[r.phase] || r.phase),
          h("button", { class: "btn", onclick: () => join(c) }, "Join"))) : h("p", { class: "hint" }, "No public rooms right now. Make one!"));
      });
      if (args.code) join(args.code);
    } catch (e) { fill(list, h("p", { class: "err" }, e.message)); }
  })();

  const el = h("div", { class: "frame" },
    h("div", { class: "topbar" }, h("div", { class: "marquee" }, h("span", null, "*** MULTIPLAYER LOBBY *** BRING FRIENDS *** UP TO 6 PLAYERS *** "))),
    h("div", { class: "page" },
      h("button", { class: "btn s back", onclick: () => app.go("menu") }, "< Back"),
      h("h2", { class: "h2" }, "Multiplayer"),
      h("div", { class: "cols" },
        h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "YOU"), h("div", { class: "pad" }, h("label", { class: "lbl" }, "Name"), name)),
        h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "CREATE A ROOM"),
          h("div", { class: "pad" }, roomName, h("label", { class: "chk" }, pub, " list it publicly"), h("button", { class: "btn big", onclick: create }, "Create room"))),
        h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "JOIN WITH A CODE"),
          h("div", { class: "pad" }, code, h("button", { class: "btn big", onclick: () => code.value.length === 4 ? join(code.value) : toast("The code has 4 letters") }, "Join")))),
      msg,
      h("div", { class: "win" }, h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "PUBLIC ROOMS"), h("div", { class: "pad" }, list))));
  return { el, destroy() { alive = false; if (off) off(); } };
}
