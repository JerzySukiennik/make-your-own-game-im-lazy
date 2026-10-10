/* Quick feedback options. The hint is what Haiku reads. */
export const FEEDBACK = [
  { id: "broken", label: "It doesn't work / nothing happens", hint: "The game does not work: nothing happens or it seems broken. Check that init/update/draw run, that the start state is playable and that nothing throws." },
  { id: "noplayer", label: "I can't see a player", hint: "Some player is not visible. Every player in G.players must be drawn every frame (use G.drawPlayer and the data from G.net.of / G.net.others), with a visible fallback when no avatar exists, inside the 1280x720 screen." },
  { id: "nocursor", label: "I can't see my cursor", hint: "A player's cursor is not visible. Call G.drawCursors() last in draw() so every player's pointer is drawn, and make sure cursor drawings are used." },
  { id: "controls", label: "Controls don't respond", hint: "Controls do not respond properly (keyboard or mouse). Re-check input handling with G.key, G.keyPressed and G.mouse, and show the controls on screen." },
  { id: "size", label: "A drawing is too big or too small", hint: "Some drawings are shown at the wrong size. Adjust the manifest sizes and the h/w passed to G.draw so every asset has a sensible on-screen size." },
  { id: "missing", label: "A drawing is missing or looks wrong", hint: "A drawing is missing or used wrongly. Make sure every asset in the list is actually used where its description says, with the right slug." },
  { id: "hard", label: "Too hard", hint: "The game is too hard. Make it more forgiving and easier to learn." },
  { id: "easy", label: "Too easy / boring", hint: "The game is too easy or boring. Add more challenge and variety." },
  { id: "slow", label: "It lags", hint: "The game lags. Reduce the number of entities and the per-frame work and avoid allocations in update/draw." },
  { id: "notasked", label: "Not what we described", hint: "The game does not match the players' description. Re-read the description and the answers and bring the game closer to them." },
  { id: "multi", label: "Multiplayer is broken", hint: "Multiplayer is broken: players do not see each other, or things are out of sync. Follow the ownership model: each player publishes their own state with G.net.setMine, the host publishes the shared world with G.net.setShared, events go through G.net.emit." }
];
