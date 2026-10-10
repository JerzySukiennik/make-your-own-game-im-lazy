import { app } from "./app.js";
import { $ } from "./util.js";
import { menuView } from "./ui/menu.js";
import { lobbyView } from "./ui/lobby.js";
import { roomView } from "./ui/roomview.js";
import { galleryView } from "./ui/gallery.js";

app.root = $("#app");
app.views = { menu: menuView, lobby: lobbyView, room: roomView, gallery: galleryView };

const m = location.hash.match(/^#\/room\/([A-Za-z]{4})$/);
if (m) {
  app.go("lobby", { code: m[1].toUpperCase() });
} else {
  app.go("menu");
}
window.MYOG = app;
