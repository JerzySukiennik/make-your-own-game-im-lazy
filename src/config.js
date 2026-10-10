/* Make Your Own Game: config. The Firebase web config is public by design. */
export const CFG = {
  firebase: {
    apiKey: "AIzaSyA4n9PKZCL2NNSmZ7_QChtptwcuk1bXtbg",
    authDomain: "myog-gzowo.firebaseapp.com",
    databaseURL: "https://myog-gzowo-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "myog-gzowo",
    appId: "1:385219414014:web:d2a0a7b7016538a64622af"
  },
  sdkVersion: "10.14.1",
  maxPlayers: 6,
  maxAssets: 30,
  maxAssetBytes: 100000,
  maxRounds: 3,
  maxPrompt: 1200,
  maxDesc: 400,
  api: (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "" : "https://myog-api.kalakasanyt.workers.dev"
};
export const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#00a8a8", "#d6a800", "#f032e6", "#7a5230", "#000000"];
export const TEMPLATES = [
  ["Runner like Mario", "A side-scrolling runner like Mario. Everyone runs together to the right, jumps over gaps and enemies, and collects coins."],
  ["Tetris", "Falling blocks like Tetris. Every player has their own board next to the others, clear lines to send junk to opponents."],
  ["Minecraft 2D", "A 2D exploration game like Minecraft. Everyone explores a shared world, digs blocks, collects wood and builds."],
  ["Fruit Ninja", "Fruit and bombs fly across the screen. Each player slices them with their own cursor. Most points wins."],
  ["Donkey Kong", "A platformer like Donkey Kong. Climb ladders and platforms to the top while barrels roll down."],
  ["Silksong-like", "A side-view metroidvania action game like Silksong. Fight bugs, jump, dash and explore a cave."],
  ["Ninja vs Zombies", "Top-down shooter. Each player draws their own gun and shoots ninjas mixed with zombies that rush in from all sides."]
];
