// node tools/test_boom.js — етап 7.63: лист вибухів (модуль 02f_boom.js) і fxBoom/boomFrame з 03_game.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../src/js/03_game.js"), "utf8"), mod = fs.readFileSync(path.join(__dirname, "../src/js/02f_boom.js"), "utf8");
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };
const win = {}; class Img { set src(v) { this._s = v; this.onload && this.onload(); } }
vm.runInNewContext(mod, { window: win, Image: Img });
const B = win.BV_BOOM;
t("модуль: параметри листа", B.cols === 8 && B.cell === 128 && B.n === 52 && B.ready === true);
t("модуль: послідовності a=0–19, b=20–51", B.seq.a[0] === 0 && B.seq.a[1] === 19 && B.seq.b[0] === 20 && B.seq.b[1] === 51);
const m = /^data:image\/webp;base64,(.+)$/.exec(B.src); const buf = Buffer.from(m[1], "base64");
t("модуль: валідний WebP-контейнер", buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP", buf.length);
const sl = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return src.slice(i, j); };
const parts = []; const sb = { window: win, P: o => parts.push(o), jitter: p => p, rnd: (a, b) => a + (b - a) / 2, performance: { now: () => 1000 }, Math };
vm.createContext(sb); vm.runInContext(sl("const boomFrame", "function fxRing"), sb); vm.runInContext("this.fxBoom = fxBoom; this.boomFrame = boomFrame;", sb);
const q = { f0: 20, f1: 51 };
t("кадр: старт = f0", sb.boomFrame(q, 0) === 20); t("кадр: майже кінець = f1", sb.boomFrame(q, 0.999) === 51); t("кадр: не виходить за f1", sb.boomFrame(q, 1.5) === 51);
t("кадр: монотонний", (() => { let p = -1; for (let e = 0; e < 1; e += 0.01){ const f = sb.boomFrame(q, e); if (f < p) return false; p = f; } return true; })());
t("кадри в межах листа 0..51", (() => { for (let e = 0; e <= 1.2; e += 0.05){ const f = sb.boomFrame({ f0: 0, f1: 19 }, e); if (f < 0 || f > 19) return false; } return true; })());
t("fxBoom b: кадри 20–51", sb.fxBoom([30, 50], { v: "b", size: 3, m: 40, life: 2000 }) && parts[0].f0 === 20 && parts[0].f1 === 51 && parts[0].k === "anim", parts[0]);
t("fxBoom a: кадри 0–19", sb.fxBoom([30, 50], { v: "a", size: 3, m: 40, life: 1000 }) && parts[1].f0 === 0 && parts[1].f1 === 19);
t("fxBoom a з f1=11: діапазон 0–11", sb.fxBoom([30, 50], { v: "a", size: 1, m: 10, life: 500, f1: 11 }) && parts[2].f1 === 11);
t("fxBoom: f1 не виходить за послідовність", sb.fxBoom([30, 50], { v: "a", size: 1, m: 10, life: 500, f1: 99 }) && parts[3].f1 === 19);
t("fxBoom: затримка зсуває t0", sb.fxBoom([30, 50], { v: "b", size: 1, m: 10, life: 500, delay: 160 }) && parts[4].t0 === 1160);
B.ready = false; t("fxBoom: лист не завантажено → false (запасний вогонь)", sb.fxBoom([30, 50], { size: 1, m: 1, life: 1 }) === false);
t("гра: ground hit викликає fxBoom із запасним варіантом", /fxBoom\(p, vb === "b"[\s\S]{0,700}else fxFireballs\(p, 8/.test(src));
t("гра: гілка anim у fxDraw", /q\.k === "anim"[\s\S]{0,400}drawImage\(B\.img/.test(src));
console.log(bad ? "FAIL " + bad : "OK: " + ok + " перевірок"); process.exit(bad ? 1 : 0);
