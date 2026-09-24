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
/* v70.2: the name/handle pair travels with roomAt, so a handle cleared on one device stays cleared on the other */
const a2 = {savedAt: t - 1000, roomName: "Sam", roomHandle: "@sam.k", roomAt: t - 2000}, b2 = {savedAt: t, roomName: "Sam", roomAt: t - 500};
m = merge(a2, b2);
check("roomAt: the later save wins even when it cleared the handle", m.roomName === "Sam" && m.roomHandle === undefined && m.roomAt === t - 500, [m.roomName, m.roomHandle, m.roomAt]);
m = merge(b2, a2);
check("roomAt: the argument order does not matter", m.roomHandle === undefined && m.roomAt === t - 500, [m.roomHandle, m.roomAt]);
const a3 = {savedAt: t - 1000, roomName: "Sam", roomHandle: "@sam.k", roomAt: t - 500}, b3 = {savedAt: t, roomName: "Sam", roomHandle: "@sam.new"};
m = merge(a3, b3);
check("roomAt on one side only (the other device is on an older build): the stamped pair wins", m.roomHandle === "@sam.k" && m.roomAt === t - 500, [m.roomHandle, m.roomAt]);
m = merge({savedAt: t - 1000, roomHandle: "@old"}, {savedAt: t, roomHandle: ""});
check("no roomAt anywhere: the old rule, a real value beats a newer empty one, and no roomAt appears", m.roomHandle === "@old" && m.roomAt === undefined, [m.roomHandle, m.roomAt]);
/* v70.4: roomSeen — when this student last looked at each room; per room the later look wins, and it follows the student */
m = merge({savedAt: t - 1000, roomSeen: {"210": t - 100, "105": t - 900}}, {savedAt: t, roomSeen: {"210": t - 50}});
check("roomSeen: per room the later look wins, rooms seen on one device only are kept", m.roomSeen["210"] === t - 50 && m.roomSeen["105"] === t - 900, m.roomSeen);
m = merge({savedAt: t - 1000}, {savedAt: t});
check("roomSeen: absent on both sides stays absent", m.roomSeen === undefined, m.roomSeen);
m = merge({savedAt: t - 1, recapHide: t - 500}, {savedAt: t, recapHide: t - 900});
check("recapHide: the later dismissal wins", m.recapHide === t - 500, m.recapHide);
m = merge({savedAt: t - 1, sessLog: {s1: 5}, wrappedSeen: {a: 1}, goal: {"ECN 212": 90}}, {savedAt: t, sessLog: {s2: 6}, wrappedSeen: {b: 2}, goal: {"ECN 212": 93, "HST 100": 87}});
check("goal: newer wins per course, courses union", m.goal["ECN 212"] === 93 && m.goal["HST 100"] === 87, m.goal);
check("sessLog and wrappedSeen union", m.sessLog.s1 === 5 && m.sessLog.s2 === 6 && m.wrappedSeen.a === 1 && m.wrappedSeen.b === 2, [m.sessLog, m.wrappedSeen]);
m = merge({savedAt: t - 1, courseColor: {"ECN 212": "c1", "PSY 101": "c5"}}, {savedAt: t, courseColor: {"ECN 212": "c3"}});
check("courseColor: newer wins per course, courses union", m.courseColor["ECN 212"] === "c3" && m.courseColor["PSY 101"] === "c5", m.courseColor);
check("absent courseColor stays absent", !("courseColor" in merge({savedAt: t - 1}, {savedAt: t})), "leaked");
m = merge({savedAt: t}, {savedAt: t - 1});
check("absent goal stays absent", !("goal" in m), Object.keys(m).filter(k => /goal/.test(k)));
m = merge({savedAt: t - 1, roomName: "Old"}, {savedAt: t, roomName: "New"});
check("roomName: newer non-empty wins", m.roomName === "New", m.roomName);
m = merge({savedAt: t - 1, aheadSkip: {a1: "2026-09-14", a2: "2026-09-10"}}, {savedAt: t, aheadSkip: {a2: "2026-09-12", a3: "2026-09-14"}});
check("aheadSkip: union, the later day wins per id", m.aheadSkip.a1 === "2026-09-14" && m.aheadSkip.a2 === "2026-09-12" && m.aheadSkip.a3 === "2026-09-14", m.aheadSkip);
m = merge({savedAt: t}, {savedAt: t - 1});
check("absent aheadSkip stays absent", !("aheadSkip" in m), Object.keys(m).filter(k => /ahead/.test(k)));
m = merge({savedAt: t}, {savedAt: t - 1});
check("absent room keys stay absent (no empty-string litter)", !("roomName" in m) && !("roomHandle" in m) && !("roomNudge" in m) && !("recapHide" in m), Object.keys(m).filter(k => /^(room|recap)/.test(k)));

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
