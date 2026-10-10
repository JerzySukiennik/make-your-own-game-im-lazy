/* Shared game description: a textarea over a mirror that underlines every author's text in their colour. */
import { h, esc, throttle } from "../util.js";
import { CFG, TEMPLATES } from "../config.js";

export function promptBox(room, opts) {
  opts = opts || {};
  const mirror = h("div", { class: "pb-mirror", "aria-hidden": "true" });
  const ta = h("textarea", { class: "pb-ta", spellcheck: "false", maxlength: CFG.maxPrompt, placeholder: "What kind of game is this? e.g. \"A Minecraft-like exploration game\" or \"Tetris, but everyone plays at once\". Everyone can type here at the same time." });
  const wrap = h("div", { class: "pb" }, mirror, ta);
  const count = h("div", { class: "pb-count" });
  const chips = h("div", { class: "pb-chips" }, h("span", { class: "lbl" }, "Ideas:"), TEMPLATES.map(([name, text]) =>
    h("button", { class: "chip-btn", title: text, onclick: () => insertTemplate(text) }, name)));
  const el = h("div", { class: "pbx" }, wrap, count, chips);

  let lastText = "";
  let prevIds = [];
  let locked = false;

  function insertTemplate(text) {
    if (locked) return;
    const cur = room.doc.text();
    const next = cur.trim() ? cur.replace(/\s*$/, "") + "\n" + text : text;
    room.sendPrompt(next);
    refresh(true);
  }

  function charIndexFor(id) { return room.doc.indexAfter(id); }

  function render() {
    const vis = room.doc.visible();
    const text = vis.map((n) => n.ch).join("");
    const marks = [];
    for (const [pid, v] of Object.entries(room.players)) {
      if (pid === room.me.id || !v.cur) continue;
      const s = charIndexFor(v.cur.s), e = charIndexFor(v.cur.e);
      if (s == null || e == null) continue;
      marks.push({ pid, s: Math.min(s, e), e: Math.max(s, e), caret: e, color: v.color, name: v.name });
    }
    const frag = document.createDocumentFragment();
    let run = null;
    const flush = () => { if (run) { frag.append(run.el); run = null; } };
    const attrOf = (i) => {
      let sel = "";
      for (const m of marks) if (m.s !== m.e && i >= m.s && i < m.e) sel = m.color;
      return vis[i].site + "|" + sel;
    };
    const carets = {};
    for (const m of marks) (carets[m.caret] = carets[m.caret] || []).push(m);
    const caretEl = (list) => {
      const c = h("span", { class: "rc" });
      for (const m of list) c.append(h("span", { class: "rc-bar", style: { background: m.color } }), h("span", { class: "rc-name", style: { background: m.color } }, m.name));
      return c;
    };
    for (let i = 0; i <= vis.length; i++) {
      if (carets[i]) { flush(); frag.append(caretEl(carets[i])); }
      if (i === vis.length) break;
      const k = attrOf(i);
      if (!run || run.k !== k) {
        flush();
        const site = vis[i].site, sel = k.split("|")[1];
        const col = room.colorOf(site);
        const el2 = h("span", { class: "pb-run", style: { "--c": col, background: sel ? sel + "40" : "" } });
        run = { k, el: el2, t: "" };
      }
      run.t += vis[i].ch;
      run.el.textContent = run.t;
    }
    flush();
    frag.append(document.createTextNode("​"));
    mirror.replaceChildren(frag);
    count.textContent = text.length + " / " + CFG.maxPrompt;
    return text;
  }

  function refresh(force) {
    const text = room.doc.text();
    if (text !== ta.value) {
      const hadFocus = document.activeElement === ta;
      const a = ta.selectionStart, b = ta.selectionEnd;
      const idA = hadFocus ? (a > 0 ? prevIds[a - 1] || "0" : "0") : null, idB = hadFocus ? (b > 0 ? prevIds[b - 1] || "0" : "0") : null;
      ta.value = text;
      if (hadFocus) {
        const na = room.doc.indexAfter(idA), nb = room.doc.indexAfter(idB);
        ta.setSelectionRange(na == null ? a : na, nb == null ? b : nb);
      }
    }
    lastText = text;
    prevIds = room.doc.visible().map((n) => n.id);
    render();
    syncScroll();
  }

  function syncScroll() { mirror.scrollTop = ta.scrollTop; }
  ta.addEventListener("scroll", syncScroll);

  const sendCursor = throttle(() => {
    room.setCursor({ s: room.doc.idBefore(ta.selectionStart), e: room.doc.idBefore(ta.selectionEnd) });
  }, 120);
  ["keyup", "click", "select", "focus"].forEach((ev) => ta.addEventListener(ev, sendCursor));
  document.addEventListener("selectionchange", () => { if (document.activeElement === ta) sendCursor(); });

  ta.addEventListener("input", () => {
    if (locked) { ta.value = lastText; return; }
    room.sendPrompt(ta.value);
    lastText = room.doc.text();
    prevIds = room.doc.visible().map((n) => n.id);
    if (ta.value !== lastText) ta.value = lastText;
    render();
    sendCursor();
  });

  const off = room.on("prompt", () => refresh());
  const off2 = room.on("players", () => render());

  refresh();

  return {
    el,
    refresh,
    setLocked(v) { locked = v; ta.readOnly = v; wrap.classList.toggle("locked", v); chips.style.display = v ? "none" : ""; },
    destroy() { off(); off2(); }
  };
}
