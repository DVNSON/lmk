/* buildGrades: the course id must come from ANY row that carries one.
   It used to come from scored[0], and EVENTS is sorted by due date — so a hand-graded custom row or a
   syllabus-paste item (neither has a store.ext.items entry) sorting earliest left cid empty, dropped the
   course's whole weights map, and graded on straight points. Measured 91.7% where the weights say 64.3%.
   Run after touching buildGrades:  node ~/lmk-web/tools/test-grades.js  */
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
const code = grab("buildGrades") + "\n" +
  "function letterFor(p){ return 'X'; }\n" +
  "function extInProgress(){ return false; }\n" +
  "let COURSES = [];\n" +
  "module.exports = {buildGrades, setC: c => { COURSES = c; }, getG: () => GRADES};";
const wrap = new Function("store", "EVENTS", "GRADES", "module", "exports",
  "let GRADES_ = GRADES;" + code.replace(/\bGRADES\b/g, "GRADES_") + ";return module.exports;");

let pass = 0, fail = 0;
const check = (name, cond, note) => cond ? (pass++, console.log("ok   " + name))
  : (fail++, console.log("FAIL " + name + (note ? "  -> " + note : "")));

function build({weights, wt = true, scored = [], canvasPct = null}){
  const items = {}, EV = [], grades = {};
  let n = 1;
  scored.forEach(([grp, pts, got, opt]) => {
    const aid = String(1000 + n++);
    // `noExt` is the real-world case: a custom row or syllabus paste, which never gets an ext entry
    if (!(opt && opt.noExt)) items[aid] = {cid: "C1", grp: String(grp), pts, k: ""};
    EV.push({id: "a" + aid, course: "TST", title: "i" + aid, kind: ""});
    grades["a" + aid] = {got, max: pts};
  });
  const groups = Object.entries(weights || {}).map(([id, w]) => ({id, name: "G" + id, w}));
  return {store: {dropped: {}, grades,
    ext: {items, groups: {C1: groups}, courses: [{id: "C1", tag: "TST", wt, cur: canvasPct, fin: null}]}}, EVENTS: EV};
}
function head(sc){
  const m = wrap(sc.store, sc.EVENTS, null, {exports: {}}, {});
  m.setC(["TST"]); m.buildGrades(); return m.getG()["TST"];
}

// weights 20/50/30; five homeworks at 100/100 and a midterm at 50/100.
const W = {hw: 20, exam: 50, final: 30};
const rows = [["hw",100,100],["hw",100,100],["hw",100,100],["hw",100,100],["hw",100,100],["exam",100,50]];

const plain = head(build({weights: W, scored: rows}));
check("a normal weighted course weights correctly", plain.weighted === true && plain.mine === 64.3, JSON.stringify(plain));

// the earliest-due graded row has no ext entry — this is what used to break it
const odd = head(build({weights: W, scored: [["hw",100,100,{noExt:true}], ...rows.slice(1)]}));
check("an earliest row with no ext entry no longer un-weights the course", odd.weighted === true, JSON.stringify(odd));
check("and the grade is the weighted one, not the points average", odd.mine !== 91.7 && odd.mine < 80, JSON.stringify({mine: odd.mine}));

// a course that really has no weights still grades on points
const none = head(build({weights: {}, scored: rows}));
check("a course with no weights still grades on straight points", none.weighted === false, JSON.stringify(none));

// apply_assignment_group_weights false means points, however the weights are set
const off = head(build({weights: W, wt: false, scored: rows}));
check("apply_assignment_group_weights=false is still honoured", off.weighted === false, JSON.stringify(off));

// Canvas's own number stays the headline
const canvas = head(build({weights: W, scored: rows, canvasPct: 71.5}));
check("Canvas's number stays the headline, LMK's stays the second opinion", canvas.pct === 71.5 && canvas.src === "canvas" && canvas.mine === 64.3, JSON.stringify(canvas));

console.log("\n" + (fail ? fail + " FAILED" : "ALL OK") + "  (" + pass + " passed)");
process.exit(fail ? 1 : 0);
