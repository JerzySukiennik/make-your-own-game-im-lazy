/* Test drawings for the harness: simple stroke-based assets keyed by slug. */
const circle = (cx, cy, rx, ry, n = 28) => { const p = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; p.push(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))); } return p; };
const box = (x, y, w, h) => [[x, y, x + w, y, x + w, y + h, x, y + h]];
let z = 1;
const B = (c, w, p) => ({ t: "b", c, w, p, z: z++ + 1.7e12 });
const F = (c, polys) => ({ t: "f", c, polys, z: z++ });

const LIB = {
  apple: () => ({ kind: "vector", strokes: [F("#e23", [circle(500, 540, 270, 250)]), B("#700", 18, circle(500, 540, 270, 250)), B("#3a7d1e", 26, [500, 290, 520, 200, 580, 150])] }),
  bomb: () => ({ kind: "vector", strokes: [F("#222", [circle(500, 580, 300, 300)]), B("#000", 20, circle(500, 580, 300, 300)), B("#c80", 20, [560, 300, 620, 200, 700, 170]), B("#fd0", 30, [700, 170, 710, 160])] }),
  blade_cursor: () => ({ kind: "vector", strokes: [B("#aaa", 40, [150, 850, 700, 300]), B("#642", 60, [100, 900, 200, 800]), B("#222", 14, [700, 300, 850, 150])] }),
  pixel_cursor: () => { const c = []; for (let i = 0; i < 18; i++) { c.push(8, 8 + i); if (i < 12) c.push(8 + i, 8 + i); } return { kind: "pixel", grid: 64, strokes: [{ t: "p", c: "#0a8", cells: c, z: 1 }] }; },
  dojo: () => ({ kind: "vector", strokes: [F("#e8d8b0", box(0, 0, 1000, 1000)), B("#7a5230", 30, [0, 760, 1000, 760]), B("#a33", 40, [100, 100, 100, 700]), B("#a33", 40, [900, 100, 900, 700])] }),
  tree: () => ({ kind: "vector", strokes: [B("#6b4423", 120, [500, 1000, 500, 450]), F("#2d8a2d", [circle(500, 280, 330, 260)]), B("#145a14", 16, circle(500, 280, 330, 260))] }),
  dirt_block: () => ({ kind: "vector", strokes: [F("#8b5a2b", box(20, 20, 960, 960)), B("#5a3a1a", 14, [20, 20, 980, 20, 980, 980, 20, 980, 20, 20]), B("#5a3a1a", 22, [200, 300, 240, 310]), B("#5a3a1a", 22, [600, 650, 650, 640])] }),
  stone_block: () => ({ kind: "vector", strokes: [F("#8c8c8c", box(20, 20, 960, 960)), B("#444", 14, [20, 20, 980, 20, 980, 980, 20, 980, 20, 20]), B("#555", 18, [150, 150, 300, 260]), B("#555", 18, [600, 700, 800, 620])] }),
  hero: () => ({ kind: "vector", strokes: [B("#222", 40, [500, 300, 500, 650]), B("#222", 36, [500, 650, 380, 950]), B("#222", 36, [500, 650, 620, 950]), B("#222", 30, [500, 400, 350, 560]), B("#222", 30, [500, 400, 650, 560]), F("#f5c9a0", [circle(500, 200, 140, 140)]), B("#222", 16, circle(500, 200, 140, 140)), B("#a52", 40, [330, 110, 670, 110])], rig: { points: [{ r: "head", x: .5, y: .15 }, { r: "body", x: .5, y: .5 }, { r: "legL", x: .38, y: .9 }, { r: "legR", x: .62, y: .9 }, { r: "armL", x: .3, y: .55 }, { r: "armR", x: .7, y: .55 }] } }),
  robot: () => ({ kind: "vector", strokes: [F("#58c", box(300, 300, 400, 450)), B("#124", 16, [300, 300, 700, 300, 700, 750, 300, 750, 300, 300]), F("#58c", box(350, 80, 300, 200)), B("#124", 16, [350, 80, 650, 80, 650, 280, 350, 280, 350, 80]), B("#ff0", 40, [430, 170, 440, 170]), B("#ff0", 40, [560, 170, 570, 170]), B("#124", 36, [400, 750, 400, 950]), B("#124", 36, [600, 750, 600, 950])] }),
  sky: () => ({ kind: "vector", strokes: [F("#7ec8ff", box(0, 0, 1000, 1000)), F("#fff", [circle(250, 250, 160, 70)]), F("#fff", [circle(700, 380, 200, 80)])] })
};

export function fixtureAssets(names, labels) {
  labels = labels || {};
  return names.map((name, i) => {
    const mk = (LIB[name] || LIB.dirt_block)();
    const a = { id: "t" + i, name, label: (labels[name] || {}).label || "", owner: (labels[name] || {}).owner || "", kind: mk.kind, grid: mk.grid || 64, strokes: mk.strokes, rig: mk.rig || null, svg: null, snd: null, ai: false };
    const art = { kind: a.kind, strokes: a.strokes, grid: a.grid };
    a.bb = Art.tightBounds(art);
    return a;
  });
}
export function parseOut(txt) {
  const man = txt.match(/<manifest>([\s\S]*?)<\/manifest>/i);
  const code = txt.match(/<code>([\s\S]*?)<\/code>/i);
  let src = code ? code[1] : (txt.match(/<code>([\s\S]*)$/i) || [])[1];
  src = src.replace(/^\s*```(?:javascript|js)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return { manifest: man ? JSON.parse(man[1]) : {}, code: src };
}
