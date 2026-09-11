/* mergeStores, in node, against the shipped source. The syntax check cannot catch the failure mode that
   took sync down once (lines slipped between a brace-less `for` header and its body threw on every merge,
   and the push path then overwrote Drive with local state) — only calling it can.
   Run after touching mergeStores or adding a store key:  node ~/lmk-web/tools/test-merge.js  */
const fs = require("fs");
const src = fs.readFileSync("/Users/dieuvenson/lmk-web/app/index.html", "utf8");
function grab(name){
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("no " + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++){
    const c = src[j];
    if (c === "{"){ d++; started = true; }
    else if (c === "}"){ d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error("unbalanced " + name);
}
const merge = new Function("let store = {};\n" + grab("migrateIds") + "\n" + grab("mergeStores") + "\nreturn mergeStores;")();
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log((ok ? "ok   " : "FAIL ") + n + (ok ? "" : "  -> " + JSON.stringify(d))); ok ? pass++ : fail++; };
const t = Date.now();

// 1. two empty stores merge to something sane — the regression that broke sync threw here
let m; try { m = merge({}, {}); check("empty ⨯ empty merges without throwing", !!m && typeof m === "object"); } catch(e) { check("empty ⨯ empty merges without throwing", false, String(e)); }

// 2. maps union, newer wins per key; done marks survive both ways
const a = {savedAt: t - 1000, done: {a1: t - 5000, a2: t - 4000}, starred: {a1: t}, adminKey: "K", roomName: "Emiel", roomHandle: "Discord: e", roomNudge: t - 9000, recapSeen: {r1: 1}};
const b = {savedAt: t, done: {a3: t - 3000}, adminKey: "", roomName: "", roomHandle: "", roomNudge: 0, recapSeen: {r2: 1}};
m = merge(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
check("done marks from both devices survive", m.done.a1 && m.done.a2 && m.done.a3, m.done);
check("recapSeen unions", m.recapSeen.r1 === 1 && m.recapSeen.r2 === 1, m.recapSeen);
check("adminKey: a real key beats a newer empty one", m.adminKey === "K", m.adminKey);
check("roomName / roomHandle: a real value beats a newer empty one", m.roomName === "Emiel" && m.roomHandle === "Discord: e", [m.roomName, m.roomHandle]);
check("roomNudge: the later dismissal wins", m.roomNudge === t - 9000, m.roomNudge);
m = merge({savedAt: t - 1, roomName: "Old"}, {savedAt: t, roomName: "New"});
check("roomName: newer non-empty wins", m.roomName === "New", m.roomName);
m = merge({savedAt: t}, {savedAt: t - 1});
check("absent room keys stay absent (no empty-string litter)", !("roomName" in m) && !("roomHandle" in m) && !("roomNudge" in m), Object.keys(m).filter(k => /^room/.test(k)));

// 3. a tombstone beats an older done mark and loses to a newer one
m = merge({savedAt: t, done: {a9: t - 50}, deleted: {}}, {savedAt: t - 1, done: {}, deleted: {"done:a9": t - 100}});
check("a newer done mark beats an older removal", !!m.done.a9, m);
m = merge({savedAt: t, done: {a9: t - 100}, deleted: {}}, {savedAt: t - 1, done: {}, deleted: {"done:a9": t}});
check("a newer removal beats an older done mark", !m.done.a9, m.done);

// 4. cloud: earliest id wins, the newer save decides on/off
m = merge({savedAt: t, cloud: {sid: "a".repeat(16), secret: "x", on: false, at: t - 10}}, {savedAt: t - 1, cloud: {sid: "b".repeat(16), secret: "y", on: true, at: t - 20}});
check("cloud keeps the earlier id and the newer on/off", m.cloud.sid === "b".repeat(16) && m.cloud.on === false, m.cloud);

if (fail) { console.error(fail + " FAILED"); process.exit(1); }
console.log("ALL OK (" + pass + ")");
