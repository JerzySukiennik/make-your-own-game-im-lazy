import { h, fill, toast } from "../util.js";

export function galleryView(app) {
  const grid = h("div", { class: "gcards" }, h("p", { class: "hint" }, "Loading games..."));
  const name = h("input", { type: "text", maxlength: 16, placeholder: "your name", value: app.me.name, class: "nameinp" });
  name.addEventListener("input", () => app.setName(name.value));
  const need = () => { if (!name.value.trim()) { toast("Type your name first!"); name.focus(); return false; } app.setName(name.value.trim()); return true; };

  async function launch(id, entry, multi) {
    if (!need()) return;
    try {
      const fb = await app.backend("firebase");
      const g = await fb.get("gallery/games/" + id);
      if (!g || !g.pkg) throw new Error("That game is gone");
      fb.transaction("gallery/index/" + id + "/plays", (n) => (n || 0) + 1);
      const room = await app.newRoom(multi ? "firebase" : "solo", { pub: false });
      await room.b.set(room.p + "/game", { title: entry.title, gen: 1, pkg: g.pkg, thumb: entry.thumb || "", ok: true, t: room.b.now() });
      await room.setMeta({ phase: "play", gen: 1 });
      await app.openRoom(room);
    } catch (e) { toast(e.message); }
  }

  (async () => {
    try {
      const fb = await app.backend("firebase");
      const idx = (await fb.get("gallery/index")) || {};
      const rows = Object.entries(idx).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
      fill(grid, rows.length ? rows.map(([id, g]) => h("div", { class: "gcard win" },
        h("div", { class: "gthumb" }, g.thumb ? h("img", { src: g.thumb, alt: "" }) : h("span", null, "no preview")),
        h("div", { class: "gtitle" }, g.title),
        h("div", { class: "gby" }, "by " + (g.authors || "someone") + " | " + (g.n || 1) + " player" + (g.n > 1 ? "s" : "")),
        h("div", { class: "gprompt" }, g.prompt || ""),
        h("div", { class: "row2" },
          h("button", { class: "btn", onclick: () => launch(id, g, false) }, "Play solo"),
          h("button", { class: "btn", onclick: () => launch(id, g, true) }, "Play with friends")),
        h("div", { class: "hint" }, (g.plays || 0) + " plays"))) : h("p", { class: "hint" }, "Nothing here yet. Be the first: build a game, play it, press Publish."));
    } catch (e) { fill(grid, h("p", { class: "err" }, e.message)); }
  })();

  const el = h("div", { class: "frame" },
    h("div", { class: "topbar" }, h("div", { class: "marquee" }, h("span", null, "*** THE GALLERY *** GAMES MADE BY PEOPLE LIKE YOU *** "))),
    h("div", { class: "page" },
      h("button", { class: "btn s back", onclick: () => app.go("menu") }, "< Back"),
      h("h2", { class: "h2" }, "Gallery"), h("div", { class: "row2" }, h("label", { class: "lbl" }, "Your name:"), name), grid));
  return { el };
}
