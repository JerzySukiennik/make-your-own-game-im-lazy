/* Connects the game iframe to the room's realtime channel. */
export function bridge(room, game, gen, solo) {
  const b = room.b, me = room.me.id;
  const base = `${room.p}/play/${gen}`;
  const unsubs = [];
  const joinedAt = b.now();
  const toGame = (m) => game.send(m);

  unsubs.push(b.on(base + "/st", "child_added", (v, id) => { if (id !== me) toGame({ t: "mine", from: id, v: safeParse(v.v) }); }));
  unsubs.push(b.on(base + "/st", "child_changed", (v, id) => { if (id !== me) toGame({ t: "mine", from: id, v: safeParse(v.v) }); }));
  unsubs.push(b.on(base + "/cur", "child_added", (v, id) => { if (id !== me) toGame({ t: "cur", from: id, x: v.x, y: v.y }); }));
  unsubs.push(b.on(base + "/cur", "child_changed", (v, id) => { if (id !== me) toGame({ t: "cur", from: id, x: v.x, y: v.y }); }));
  unsubs.push(b.on(base + "/ev", "child_added", (v) => {
    if (v.from === me || (v.t || 0) < joinedAt - 1500) return;
    toGame({ t: "ev", from: v.from, type: v.type, data: safeParse(v.d) });
  }));
  const sh = (v, key) => { if (!v || v.by === me) return; const o = {}; o[key] = safeParse(v.v); toGame({ t: "shared", patch: o }); };
  unsubs.push(b.on(base + "/sh", "child_added", sh));
  unsubs.push(b.on(base + "/sh", "child_changed", sh));

  const sendPlayers = () => toGame({ t: "players", list: room.playerList(), hostId: room.hostId() });
  const offP = room.on("players", sendPlayers);

  return {
    handle(m) {
      if (m.t === "mine") b.set(`${base}/st/${me}`, { v: JSON.stringify(m.v) });
      else if (m.t === "cur") b.set(`${base}/cur/${me}`, { x: m.x, y: m.y });
      else if (m.t === "emit") {
        b.push(base + "/ev", { from: me, type: String(m.type).slice(0, 40), d: JSON.stringify(m.data === undefined ? null : m.data).slice(0, 20000), t: b.now() })
          .then((key) => setTimeout(() => b.remove(`${base}/ev/${key}`), 12000));
      } else if (m.t === "shared") {
        const up = {};
        for (const k of Object.keys(m.patch || {})) up[String(k).slice(0, 40)] = { by: me, v: JSON.stringify(m.patch[k]).slice(0, 60000) };
        b.update(base + "/sh", up);
      }
    },
    destroy() {
      unsubs.forEach((u) => u());
      offP();
      b.remove(`${base}/st/${me}`); b.remove(`${base}/cur/${me}`);
    }
  };
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
