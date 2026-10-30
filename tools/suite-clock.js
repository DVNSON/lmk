/* A faked hour for the suites that read the plan (2026-10-29). The planner gives today only what is left of it, so a suite run at
   23:30 saw one quiz fit today and three go to tomorrow, and failed a check written at 17:30. The page's Date is pinned to today at
   LMK_TEST_HOUR o'clock (default 9) in the page's own zone; the worlds' due instants are built on the Node side from the real today,
   so the day still agrees. LMK_TEST_HOUR= (empty) runs on the real clock, e.g. to see the late-evening case. */
const HOUR = process.env.LMK_TEST_HOUR === '' ? null : Number(process.env.LMK_TEST_HOUR == null ? 9 : process.env.LMK_TEST_HOUR);
function clockScript(){
  if (HOUR == null || !isFinite(HOUR)) return null;
  return `(function(){ const R = Date; const t = new R(); t.setHours(${HOUR}, 0, 0, 0); let off = t.getTime() - R.now();
    class D extends R { constructor(...a){ a.length ? super(...a) : super(R.now() + off); } static now(){ return R.now() + off; } }
    window.__clockSet = ms => { off = ms - R.now(); }; window.Date = D; })()`;
}
module.exports = {clockScript, HOUR};
