import { h, ls, toast } from "../util.js";
import { health } from "../ai/client.js";

export function menuView(app) {
  const hits = (ls("hits") || 1336) + 1;
  ls("hits", hits);
  const name = h("input", { type: "text", maxlength: 16, placeholder: "type your name", value: app.me.name, class: "nameinp" });
  name.addEventListener("input", () => app.setName(name.value));
  const need = () => { if (!name.value.trim()) { toast("Type your name first!"); name.focus(); return false; } app.setName(name.value.trim()); return true; };

  const status = h("div", { class: "aistat" }, "Checking Haiku...");
  health().then((j) => {
    if (!j) { status.textContent = "Haiku: server not reachable"; status.className = "aistat bad"; return; }
    if (j.mock) { status.textContent = "Haiku: TEST MODE (fake answers, no key yet)"; status.className = "aistat warn"; }
    else if (j.haveKey) { status.textContent = "Haiku: awake and ready"; status.className = "aistat ok"; }
    else { status.textContent = "Haiku: asleep (no API key on the server)"; status.className = "aistat bad"; }
  });

  const big = (label, sub, fn) => h("button", { class: "bigbtn", onclick: fn }, h("b", null, label), h("small", null, sub));

  const el = h("div", { class: "frame" },
    h("div", { class: "topbar" }, h("div", { class: "marquee" }, h("span", null, "*** WELCOME TO THE LAZY GAME FACTORY *** DRAW IT *** DESCRIBE IT *** HAIKU CODES IT *** PLAY IT WITH FRIENDS *** NO RULES *** "))),
    h("div", { class: "banner" },
      h("div", { class: "eyebrow blink" }, "NEW!!! 100% customizable"),
      h("h1", { class: "wordart" }, "Make Your Own Game"),
      h("div", { class: "tagline" }, "I'm Lazy", h("span", { class: "sig" }, " (so a robot writes the code)"))),
    h("hr", { class: "hr90" }),
    h("div", { class: "menu-wrap" },
      h("div", { class: "menu" },
        h("label", { class: "lbl" }, "Your name:"), name,
        big("Single player", "draw it, build it, play it alone", async () => {
          if (!need()) return;
          try { const room = await app.newRoom("solo"); await app.openRoom(room); } catch (e) { toast(e.message); }
        }),
        big("Multiplayer", "up to 6 friends draw the same game", () => { if (need()) app.go("lobby"); }),
        big("Gallery", "play games other people made", () => app.go("gallery")),
        status),
      h("div", { class: "how win" },
        h("div", { class: "win-title" }, h("span", { class: "blink-dot" }), "HOW IT WORKS", h("span", { class: "x" }, "?")),
        h("ol", null,
          h("li", null, h("b", null, "Say what the game is. "), "One shared box at the top. Everyone types at once, each in their own colour."),
          h("li", null, h("b", null, "Draw the stuff. "), "A tree, a gun, a hero, a box. Rig it so it walks, or don't. Say what each thing does."),
          h("li", null, h("b", null, "Press Done. "), "Haiku checks it, asks you questions and tells you what is missing."),
          h("li", null, h("b", null, "Play. "), "Haiku writes the game around your drawings. Don't like it? Edit and rebuild.")))),
    h("hr", { class: "hr90" }),
    h("div", { class: "foot" }, h("span", { class: "counter" }, "You are visitor No. ", h("b", null, String(hits).padStart(6, "0"))), h("span", null, " | Best viewed in Netscape Navigator 4 at 800x600 | Gzowo Labs 1998-2026")));
  return { el };
}
