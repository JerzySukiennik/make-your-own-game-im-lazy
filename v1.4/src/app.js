/* App shell: identity, backend selection, navigation. */
import { uid, ls } from "./util.js";
import { Net } from "./net/net.js";
import { Room } from "./room.js";

export const app = {
  root: null,
  screen: null,
  room: null,
  me: { id: (() => { try { let i = sessionStorage.getItem("myog.pid"); if (!i) { i = uid(10); sessionStorage.setItem("myog.pid", i); } return i; } catch (e) { return uid(10); } })(), name: ls("name") || "", color: "" },
  fb: null,
  views: {},

  setName(n) { this.me.name = n.slice(0, 16); ls("name", this.me.name); },

  async backend(kind) {
    if (kind === "solo") return Net.isolated();
    if (kind === "firebase") {
      if (!this.fb) this.fb = await Net.tryFirebase();
      if (!this.fb) throw new Error("Cannot reach the multiplayer server. Try again or play Single player.");
      return this.fb;
    }
    return Net.local();
  },

  go(name, args) {
    if (this.screen && this.screen.destroy) this.screen.destroy();
    this.root.replaceChildren();
    const view = this.views[name](this, args || {});
    this.screen = view;
    this.root.append(view.el);
    window.scrollTo(0, 0);
    if (name !== "room") history.replaceState(null, "", location.pathname + location.search);
  },

  async openRoom(room) {
    this.room = room;
    history.replaceState(null, "", "#/room/" + room.code.replace(/^SOLO.*/, "solo"));
    this.go("room", { room });
  },

  async leaveRoom() {
    const r = this.room;
    this.room = null;
    if (r) await r.leave();
    this.go("menu");
  },

  async newRoom(kind, opts) {
    if (!this.me.name.trim()) throw new Error("Type your name first");
    const b = await this.backend(kind);
    const code = await Room.create(b, this.me, Object.assign({ solo: kind === "solo" }, opts || {}));
    const room = new Room(b, code, this.me);
    await room.join();
    return room;
  },

  async joinRoom(code) {
    if (!this.me.name.trim()) throw new Error("Type your name first");
    const b = await this.backend("firebase");
    const room = new Room(b, code.toUpperCase().trim(), this.me);
    await room.join();
    return room;
  }
};
