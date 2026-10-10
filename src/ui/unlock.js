import { h, toast } from "../util.js";
import { unlock, getPass, setPass } from "../ai/client.js";

/* Small "unlock code" box: removes the daily game limit on this browser. */
export function unlockBox(onChange) {
  const inp = h("input", { type: "password", placeholder: "unlock code", autocomplete: "off", class: "unl-inp" });
  const msg = h("span", { class: "hint" });
  const wrap = h("div", { class: "unl" });
  function render() {
    wrap.replaceChildren();
    if (getPass()) {
      wrap.append(h("span", { class: "unl-ok" }, "Unlocked: no game limit on this browser."), h("button", { class: "btn s", onclick: () => { setPass(""); render(); onChange && onChange(); } }, "Lock again"));
      return;
    }
    const go = async () => {
      if (!inp.value.trim()) return;
      msg.textContent = "Checking...";
      const r = await unlock(inp.value.trim());
      if (r.ok) { toast("Unlocked! No game limit now."); render(); onChange && onChange(); } else { msg.textContent = r.error || "Wrong code."; inp.value = ""; }
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    wrap.append(h("span", { class: "lbl inl" }, "Have a code?"), inp, h("button", { class: "btn s", onclick: go }, "Unlock"), msg);
  }
  render();
  return wrap;
}
