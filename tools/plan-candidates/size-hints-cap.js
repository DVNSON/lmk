/* RESULT: BEST — tuning worlds late 11 vs 16, late minutes 1706 vs 2658, late days 16 vs 21, cram 649 vs 867, idle 1308 vs 2577, moves 200 (157 later) vs 220 (190), 0 violations, not worse in late items in any world; over-days 11 (1090 min) vs 9 (260) — the overload of an infeasible week shown instead of hidden. Held-out worlds (never used to choose): late 4 vs 4, late minutes 998 vs 663 (+335: the 6-hour thing with no description, which no title rule can size, squeezed by fuller days), late days 4 vs 6, cram 577 vs 370, moves 89 vs 138. The recommended Phase B change, behind the worker switch `sizeHints`.
   Measured 2026-10-29 (tools/bench-plan.js, student follows; the bench's true minutes are drawn around the app's own sizes, so the title-level hints are judged on a scale that favours the app — the description-level gains are tools/test-estimate.js's).
Candidate size-hints-cap: size-hints with its guessed lengths damped — a context/unknown estimate is capped at 360 minutes (2026-10-29: the undamped candidate booked 24 h for an undescribed research paper and overloaded the week). */
/* Candidate size-hints (2026-10-29, directive §3): T0 assignment intelligence feeding the planner. tools/size-hints.js reads the title,
   Canvas type, points and description and gives minutes with an evidence tier; the planner takes those minutes as the prior where it has no measurement (level 'guess').
   A student's own size (effortOv), a series rule and anything learned from measurements still win, as in learnedMins. The bench's
   worlds carry titles and types only (no descriptions), and its true minutes are drawn around the app's own sizes — so this run can
   only show whether the title-level hints hurt or help; the description-level gains are measured by tools/test-estimate.js.
   Measured by tools/bench-plan.js before anything reaches app/index.html. */
/* T0 assignment intelligence: how long is this likely to take, from what Canvas says about it — deterministic, every device, no model
   (2026-10-29, directive §3; ~/lmk-docs/planner.md D). One function, no dependencies, the same file in node (tools/test-estimate.js)
   and in the page (the size-hints plan candidate; later app/index.html).

   Input: {t: title, st: Canvas submission types ("online_quiz,online_upload"), pts, k: the extension's kind hint, desc: the description
   text as collect.js ships it (first 1200 characters), qn: quiz question count, tl: quiz time limit in minutes (the last two the
   quizzes API has and the extension does not read yet)}.
   Output: {mins, lo, hi, src, why, band}. `src` is the evidence tier the directive asks for —
     explicit  a number the assignment itself states (pages, words, questions, a time limit, a video's length)
     meta      Canvas's own type with nothing else to go on (a quiz with no count, an exam sat in class)
     context   words in the title or description that say what kind of work it is, with the type's usual length
     default   nothing but the type
     unknown   a title and points, nothing else — and vague is NOT small: the estimate is the usual size for the points
   [lo, hi] is the estimator's own range; the planner may plan `mins` and the UI may say "~2 h (3–5 h?)".
   Writing rates are the Rice CTE Course Workload Estimator's (https://cte.rice.edu/workload): minutes per double-spaced 250-word page —
   reflection 45/60/75, argument 90/120/150, research 180/240/300 for no / minimal / extensive drafting; reading pages per hour —
   textbook to understand 14, journal/paperback to understand 24, close reading with many new concepts 9, survey 28. Everything with no
   published rate (problem sets, code, labs, talks) is a stated convention, in `why`, to be corrected by what students measure.
   The title decides the kind of work before the type does: "Read Ch. 7 – reading quiz" is reading that ends in a quiz, "Read chapters
   10–12 for the exam" is reading and not an exam (the app's isExam calls it one — see test-estimate), "Case study analysis" is writing
   even when the description names chapters. Pages are counted apart for reading ("20 pages in our edition") and writing ("a 3-page
   memo"). "No outside research" is not research. */
(function (root) {
  const NUMW = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20};
  const words2digits = s => s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)(?=[- ](?:page|pages|word|words|question|questions|problem|problems|exercise|exercises|proof|proofs|function|functions|lesson|lessons|slide|slides|source|sources|minute|minutes|reply|replies|classmates|peers|drafts?|essay questions?|short questions?|paragraphs?|sentences?|hours?|weeks?|cases|studies|terms|items|sides?))\b/g, m => NUMW[m]);
  const num = (s, re) => { const m = s.match(re); return m ? parseFloat(m[1]) : null; };
  const W = {reflection: [45, 60, 75], argument: [90, 120, 150], research: [180, 240, 300]};
  function sizeHints(x) {
    x = x || {};
    const t = words2digits(String(x.t || '').toLowerCase()), d = words2digits(String(x.desc || '').toLowerCase()), a = t + ' \n ' + d, st = String(x.st || ''), k = x.k || '', pts = x.pts == null ? null : +x.pts;
    const out = (mins, lo, hi, src, why) => { mins = mins >= 10 ? Math.round(mins / 5) * 5 : Math.round(mins); lo = Math.max(0, Math.round(lo)); hi = Math.max(mins, Math.round(hi)); return {mins: Math.max(0, mins), lo, hi, src, why, band: mins <= 25 ? 'quick' : mins <= 90 ? 'medium' : 'big'}; };
    const has = re => re.test(a), inTitle = re => re.test(t);
    /* --- what the title says it is --- */
    const titleRead = /^(read|reading)\b|\breading:|^(watch|listen)\b/.test(t);
    const titleProblems = /problem set|homework|\bhw\b|worksheet|exercises|\bproofs?\b|problems\b/.test(t);
    const titleCode = /\bprogram|\bcode\b|coding|\bjava\b|python|c\+\+|fizzbuzz|scraper|\bapp\b|software|codecademy|zybooks/.test(t);
    const titleWriting = /\bessay|\bpaper\b|reflection|journal|\bmemo\b|\bbrief\b|op-ed|narrative|\breview\b|analysis|proposal|\breport\b|bibliograph|portfolio|\bplan\b|summary|\bresponse\b|interview|take-home|take home|thesis|outline|position/.test(t) && !/\blab\b/.test(t);
    const exam = (/\bmidterm\b|\bexam\b/.test(t) || (/\bfinal\b/.test(t) && !/\b(draft|written|essay|paper|project|reflection|assignment|report|presentation|portfolio|proposal|video|poster|lab|deliverable|submission|response|homework|worksheet|discussion|reading|journal)s?\b/.test(t)))
      && !/\bfor (the|your|an?|our) (exam|midterm|final)|\bbefore the (exam|midterm)|\bstudy\b|\breview for\b/.test(t) && !titleRead && !/take-home|take home/.test(a);
    /* --- not work: sat in class, or an exam (its study is the prep plan) --- */
    /* "In class" comes from the extension's kind (kindHint reads submission types and points once, for the whole app) or from the text
       itself — never from `st` alone here: a "none" submission type with no kind is work until the app says otherwise (held-out world
       "nothing is described": calling it in class planned 2 minutes for a 5-hour thing). */
    if (k === 'inclass' || (/on_paper/.test(st) && exam) || has(/during (the )?(lab|class)|first (5|10) minutes of class|hand in before you leave|complete in class/)) {
      if (!titleRead && !/\bread/.test(d)) return out(exam ? 0 : 2, 0, 15, 'meta', exam ? 'an exam, sat not worked' : 'done in class');
    }
    if (exam) {
      if (/online_quiz/.test(st) && x.tl) return out(x.tl * 0.85, x.tl * 0.6, x.tl, 'explicit', 'an online exam with a ' + x.tl + '-minute limit');
      if (/online_quiz/.test(st) && x.qn) return out(x.qn * 1.6, x.qn, x.qn * 2.5, 'explicit', x.qn + ' questions');
      if (/online_quiz/.test(st)) return out(60, 30, 120, 'meta', 'an online exam, length unknown');
      return out(0, 0, 0, 'meta', 'an exam, sat not worked');
    }
    /* --- numbers the text states --- */
    const pageRange = a.match(/(?:pp\.?|pages?)\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)/);
    const rangePages = pageRange ? Math.max(0, +pageRange[2] - +pageRange[1] + 1) : null;
    const single = /single-spaced|single spaced/.test(a);
    const readPages = rangePages != null ? rangePages : num(a, /(?:read|reading|about|roughly|is|are|of)\s+(\d+)\s*pages?\b(?:\s*(?:in|of|long|total|,|\)|\.)|$)/) || num(a, /\((\d+) pages?(?![^)]*(?:double|single|typed|spaced))[^)]*\)/) || num(a, /(\d+)[- ]?pages? (?:in (?:our|the)|long|of reading|to read)/);
    let writePages = num(a, /(\d+(?:\.\d+)?)[- ]?pages?\b(?![^.]*\b(?:in our edition|in the journal|to read|of reading))(?=[^.]*\b(?:double-spaced|single-spaced|typed|write|essay|paper|memo|brief|report|reflection|response|summary|narrative|review|proposal|plan|analysis|outline|template|comments?|words|not counting|font|margins|mla|apa))/) ;
    if (writePages == null) writePages = num(a, /(?:write|writing|submit|an?|the|about)\s+(?:a\s+)?(?:short\s+)?(\d+(?:\.\d+)?)[- ]?pages?\b/);
    if (writePages == null) writePages = num(a, /\b(\d+(?:\.\d+)?)[- ]?pages?\b(?! \d)/) && !readPages ? num(a, /\b(\d+(?:\.\d+)?)[- ]?pages?\b(?! \d)/) : null;
    if (writePages != null && single) writePages *= 2;
    /* every word count in the text, summed; one followed by "each" is multiplied by the count it belongs to ("3 essay questions, about
       500 words each"; "reply to 2 classmates (100 words each)") */
    let words = null; for (const m of a.matchAll(/(\d{2,5})[- ]?words?\b/g)) { let n = +m[1]; const after = a.slice(m.index, m.index + 40), before = a.slice(Math.max(0, m.index - 80), m.index);
      if (/\beach\b/.test(after) || /\beach\b[^.]{0,25}$/.test(before)) {   // "100 words each" or "answer each in about 500 words"
        const c = num(before, /(\d+)\s*(?:essay |short )?(?:questions|drafts|prompts|classmates|peers|sources|parts|articles|replies)(?![\s\S]*\d+\s*(?:questions|drafts|prompts|classmates|peers|sources|parts|articles|replies))/) || num(before, /(\d+)\s*(?:essay |short )?(?:questions|drafts|prompts|classmates|peers|sources|parts|articles|replies)/) || 1; n *= c; }
      words = (words || 0) + n; }
    const qn = x.qn || num(a, /(\d+)\s*(?:multiple[- ]choice |short[- ]answer |essay |exam-style |review )?(?:questions|problems|exercises|proofs|items)\b/);
    const tl = x.tl || num(a, /(\d+)[- ]?(?:minute|min)\.? (?:time )?limit/) || num(a, /time limit[^.]*?(\d+) ?(?:minutes|min)/);
    const recording = /\brecord\b|film yourself|make a video|produce a video|screencast/.test(a);
    const media = recording ? null : num(a, /(\d+)[- ]?(?:minute|min)s?\)?\s*(?:video|episode|lecture|podcast|recording|film|documentary|talk)/) || num(a, /(?:video|episode|lecture|podcast|recording|documentary)[^.]*?\((\d+) ?(?:minutes|min)\)/) || num(a, /(?:watch|listen)[^.]*?(\d+)[- ]?(?:minute|min)/);
    const sources = num(a, /(?:at least |minimum of |using )?(\d+)\s*(?:scholarly |peer-reviewed |outside |academic |cited |primary )?(?:sources|studies|references|articles|cases)\b/);
    const slides = num(a, /(\d+)[- ]?slides?/), talkMins = num(a, /(\d+)[- ]?minute (?:presentation|talk|pitch|demo)/);
    const team = num(a, /teams? of (\d)(?:-(\d))?/) || (/\bgroup\b|per team|one submission per team/.test(a) ? 3 : null);
    const replies = /reply|replies|respond to (2|1) (?:classmates|peers)|peer/.test(a) ? (/\b2\b|two/.test(a.slice(a.search(/repl|respond/))) ? 2 : 1) : 0;
    const noResearch = /no (?:outside )?(?:research|citations?|sources)|without (?:outside )?research|outside sources are optional|no need to cite/.test(a);
    /* --- reading, when the title says so --- */
    const readingRate = () => /closely|line by line|seminar|engage|\bplato\b|philosoph/.test(a) ? 9 : /skim|survey|main ideas|for the (exam|midterm|test)/.test(a) ? 28 : /article|journal|pdf|paper\b/.test(a) ? 24 : 14;
    const readingOut = () => {
      let p = readPages;
      const chapters = a.match(/chapters? (\d+)\s*(?:-|–|,|and|through|to)\s*(?:(\d+)\s*(?:and|,)\s*)?(\d+)/), ch1 = a.match(/\bch(?:apter|\.)? ?(\d+)\b/);
      let src = 'explicit';
      if (p == null && chapters) { p = (+chapters[3] - +chapters[1] + 1) * 30; src = 'context'; } else if (p == null && ch1) { p = 30; src = 'context'; }
      if (p == null) { p = 25; src = 'context'; }
      const rate = readingRate();
      let m = p / rate * 60, lo = m * 0.75, hi = m * 1.4, why = p + ' pages at ' + rate + ' pages an hour';
      if (/quiz/.test(a) || /online_quiz/.test(st)) { const q = qn ? qn * 1.5 : 15; m += q; hi += q + 10; why += ', plus a quiz'; }
      if (/\bresponse\b|one-page|one page|write/.test(d) && !/quiz/.test(t)) { const wp = writePages || (words ? words / 250 : 1); m += wp * 45; lo += wp * 30; hi += wp * 60; why += ', plus ' + (wp % 1 ? wp.toFixed(1) : wp) + ' page' + (wp === 1 ? '' : 's') + ' in response'; }
      else if (/questions/.test(d) && !/quiz/.test(a)) { m += 20; hi += 30; }
      if (media) { m += media * 1.1; hi += media * 1.3; why += ', plus ' + media + ' minutes to watch'; }
      return out(m, lo, hi, src, why);
    };
    if (titleRead && !media) return readingOut();
    /* --- problem sets, when the title says so --- */
    const problemsOut = () => {
      const per = /proof/.test(a) ? 35 : /using r\b|\bcode\b|regression|dataset|interpret/.test(a) ? 50 : /worksheet/.test(a) ? 12 : 15;
      if (qn) return out(qn * per, qn * per * 0.65, qn * per * 1.6, 'explicit', qn + ' problems at about ' + per + ' minutes');
      if (/worksheet/.test(a)) return out(30, 20, 45, 'context', 'a worksheet');
      return out(60, 40, 120, 'context', 'a problem set, count unknown');
    };
    const tool = /external_tool/.test(st) || /webassign|mymathlab|mylab|mastering|\bconnect\b|aleks|achieve|learningcurve|cengage|pearson|zybooks|codecademy|quizlet|knewton|wileyplus|sapling|top hat|tophat/.test(a);
    if (titleProblems && !tool) return problemsOut();
    /* --- quizzes and online homework systems --- */
    const quiz = /online_quiz/.test(st) || k === 'quiz';
    if (quiz) {
      if (/attendance|honor code|acknowledg|exit ticket|check[- ]?in\b|confirm you|safety training/.test(a)) return out(3, 1, 5, 'context', 'a confirmation, not a quiz');
      if (tl) return out(tl * 0.8, tl * 0.5, tl, 'explicit', 'a ' + tl + '-minute time limit');
      if (qn) return out(qn * 1.5 + 2, qn * 0.6, qn * 2.5 + 5, 'explicit', qn + ' questions');
      if (/syllabus|practice/.test(t)) return out(10, 5, 30, 'context', 'a syllabus or practice quiz');
      return out(15, 5, 30, 'meta', 'a quiz, length unknown');
    }
    if (tool) {
      if (/learningcurve|adaptive|until you reach|target score/.test(a)) return out(30, 20, 50, 'context', 'an adaptive quiz runs until a target');
      if (/survey/.test(a)) return out(10, 5, 15, 'context', 'a survey');
      const lr = a.match(/lessons? (\d+)\s*(?:-|–|through|to)\s*(\d+)/), lessons = lr ? +lr[2] - +lr[1] + 1 : num(a, /(\d+) lessons/);
      if (lessons) return out(lessons * 22, lessons * 15, lessons * 30, 'explicit', lessons + ' lessons');
      const terms = num(a, /(\d+)[- ]?(?:term|card|word)s?\b/); if (terms && /flashcard|quizlet|vocab|terms/.test(a)) return out(terms * 1.6, terms * 1.1, terms * 2.3, 'explicit', terms + ' terms to learn');
      if (qn) return out(qn * 5.5, qn * 3.5, qn * 8, 'explicit', qn + ' online exercises');
      return out(45, 30, 90, 'meta', 'online homework, length unknown');
    }
    /* --- discussions --- */
    if (/discussion_topic/.test(st) || k === 'discussion' || inTitle(/discussion|discuss\b/)) {
      if (/introduce yourself|a few sentences|1 sentence/.test(a)) return out(12, 8, 20, 'context', 'a few sentences');
      if (words) { let m = words * 0.22 + replies * 12; if (readPages) m += readPages / 24 * 60; return out(m, words * 0.15 + replies * 8, words * 0.35 + replies * 20 + (readPages ? readPages * 4 : 0), 'explicit', words + ' words' + (replies ? ' and ' + replies + ' replies' : '') + (readPages ? ', after ' + readPages + ' pages' : '')); }
      return out(30 + replies * 10, 15, 60 + replies * 15, 'default', 'a discussion post');
    }
    /* --- media to watch or listen to --- */
    if (media) { const q = num(a, /(\d+) (?:short )?(?:questions|answers)/) || 0; const w = words ? words * 0.18 : q * 7; return out(media * 1.1 + w, media + w * 0.6, media * 1.3 + w * 1.6 + 10, 'explicit', media + ' minutes to watch or listen, plus the response'); }
    /* --- code --- */
    if (titleCode || has(/\bprogram|\bcode\b|coding|implement|\bjava\b|python|c\+\+|\brepo\b|repository|unit test|\.py\b|scraper|software|algorithm/)) {
      const fns = num(a, /(\d+) (?:small )?functions?/);
      if (/\bproject\b/.test(t) || /due in (2|3) weeks|deliverables|\brepository\b.*\breport\b/.test(a)) { const m = 720 / (team ? Math.max(1, team / 1.5) : 1); return out(m, m * 0.6, m * 1.7, 'context', 'a programming project' + (team ? ', in a team' : '')); }
      if (/\blab\b|hello world|install|first program/.test(a) && !fns) return out(50, 30, 90, 'context', 'a setup-and-run lab');
      if (fns) return out(fns * 55, fns * 35, fns * 95, 'explicit', fns + ' functions to write');
      if (/exercise|small|few lines|fizzbuzz/.test(a)) return out(45, 30, 75, 'context', 'a small coding exercise');
      return out(240, 150, 480, 'context', 'a programming assignment, size unknown');
    }
    /* --- reading, from the description --- */
    if (!titleWriting && (/^read\b/.test(d) || /\bread\b/.test(d) && !/write|essay|paper|post|respond|response|answer|summar/.test(t))) return readingOut();
    /* --- labs --- */
    if (/\blab\b/.test(t)) {
      if (/\bcheck\b/.test(t) && !/report|write-up|writeup/.test(a)) return out(10, 3, 20, 'context', 'a lab check, a quiz in all but name');   // Emiel's "Lab Check 1" measured one minute; Canvas calls them quizzes when the type is known
      if (/template|fill in|worksheet/.test(a)) { const p = writePages || 2; return out(p * 60, p * 40, p * 90, writePages ? 'explicit' : 'context', 'a lab template of ' + p + ' pages'); }
      if (/report|write-up|writeup/.test(a)) { const p = writePages || 4; return out(p * 120, p * 80, p * 160, writePages ? 'explicit' : 'context', 'a lab report of about ' + p + ' pages'); }
      return out(90, 45, 180, 'context', 'a lab, length unknown');
    }
    /* --- talks, posters, media to make (writing with a page count wins over a deck that comes with it) --- */
    if (has(/presentation|pitch deck|\bpitch\b|\btalk\b|slides|poster|infographic|\bvideo\b|record(ing)?|podcast episode/) && !(titleWriting && writePages >= 3)) {
      if (recording || (/\bvideo\b/.test(a) && !/presentation|slides/.test(a))) { const m = num(a, /(\d+)[- ]?minute/) || 3; return out(m * 12 + 15, m * 8 + 10, m * 20 + 30, 'explicit', 'a ' + m + '-minute recording'); }
      if (/infographic/.test(a)) return out(180, 120, 300, 'context', 'an infographic with sources');
      if (/poster/.test(a)) return out(360, 240, 600, 'context', 'a research poster');
      const base = talkMins ? talkMins * 25 : slides ? slides * 28 : 300;
      return out(base, base * 0.65, base * 1.6, talkMins || slides ? 'explicit' : 'context', talkMins ? 'a ' + talkMins + '-minute talk' : slides ? slides + ' slides' : 'a presentation, length unknown');
    }
    /* --- problem sets, from the description --- */
    if (!titleWriting && has(/problem set|\bproblems\b|homework|\bhw\b|exercises|worksheet|\bproofs?\b|calculation/)) return problemsOut();
    /* --- small things --- */
    if (!titleWriting && has(/exit ticket|1 sentence|1 paragraph|a paragraph|few sentences|check-in|screenshot|acknowledg|muddiest point/)) return out(12, 5, 25, 'context', 'a sentence or a paragraph');
    if (has(/\bsurvey\b/)) return out(10, 5, 15, 'context', 'a survey');
    if (has(/thesis statement|outline\b/) && !writePages && !/research paper|essay\b.*pages/.test(a)) return out(60, 30, 90, 'context', 'a thesis and an outline');
    /* --- writing --- */
    const writing = titleWriting || /\bessay|\bpaper\b|reflection|reflect|journal|\bresponse\b|\bmemo\b|\bbrief\b|op-ed|narrative|review\b|analysis|proposal|\breport\b|\bwrite\b|writing|bibliograph|portfolio|plan\b|summary|interview/.test(a) || (/online_text_entry/.test(st) && (words || writePages));
    if (writing) {
      const genre = !noResearch && /research|scholarly|peer-reviewed|outside sources|bibliograph|literature review|citations?\b|cite\b|bluebook|case law|appellate|business plan|market analysis|cited/.test(a) && !/\breflection\b/.test(t) && !(/\bmla\b|\bapa\b/.test(a) && !sources && !/research/.test(a)) ? 'research'
        : /argu|position|analy|\bcase\b|\bmemo\b|\bbrief\b|op-ed|thesis|recommend|evaluate|critique|persua|take a (clear )?position|1 side|debate|take-home|take home|essay questions?|claims/.test(a) ? 'argument' : 'reflection';
      const draft = /multiple drafts|extensive|peer feedback|draft 2|second draft|revis(ed|ion) (version|memo)|incorporating the (peer )?feedback|responding to my comments/.test(a) ? 2 : /revis|\bfinal\b|feedback|portfolio|turnitin|advisor/.test(a) && !/first draft|rough draft/.test(a) ? 1 : 0;
      const revisionOnly = /draft 2|second draft|revised version/.test(a) && /incorporat|feedback/.test(a);
      let p = writePages != null ? writePages : words != null ? words / 250 : null, src = p != null ? 'explicit' : 'context', why;
      if (p == null) { p = genre === 'research' ? (/paper|thesis|literature/.test(a) ? 6 : 3) : genre === 'argument' ? 3 : 1.5; if (/paragraph|short/.test(a)) p = 0.5; }
      let m = revisionOnly ? p * (W[genre][2] - W[genre][1]) : p * W[genre][draft];
      why = (p % 1 ? p.toFixed(1) : p) + ' page' + (p === 1 ? '' : 's') + ' of ' + genre + ' writing' + (draft === 2 ? ', revised more than once' : draft === 1 ? ', revised once' : '') + (src === 'context' ? ' (length guessed)' : '');
      if (/annotat/.test(a)) { m = Math.max(m, (sources || 5) * 60); why = (sources || 5) + ' sources to find and annotate'; }
      if (/interview/.test(a)) { m += 45; why += ', plus the interview'; }
      if (/portfolio/.test(a)) { m += 180; why += ', plus three revisions'; }
      if (/proposal/.test(t) && sources) m = Math.max(m, sources * 25 + 60);
      if (readPages && !/reflection|journal/.test(t)) { m += readPages / readingRate() * 60; why += ', after ' + readPages + ' pages of reading'; }
      if (/peer review|review of .* drafts/.test(a)) { const n = num(a, /(\d+) drafts/) || 2; m += n * 15; why += ', plus reading ' + n + ' drafts'; }
      if (team && /one submission per team|per team|teams? of/.test(a)) { m = m / (team * 0.7); why += ', shared by a team of ' + team; }
      const lo = src === 'explicit' ? m * 0.75 : m * 0.5, hi = src === 'explicit' ? m * 1.3 : m * 2.2;
      return out(m, lo, hi, src, why);
    }
    /* --- nothing to go on: the usual size for the points, never small because it is vague --- */
    if (pts != null && pts >= 50) return out(180, 60, 480, 'unknown', pts + ' points and no description');
    if (pts != null && pts >= 20) return out(90, 30, 180, 'unknown', pts + ' points and no description');
    if (/online_text_entry/.test(st)) return out(30, 15, 90, 'unknown', 'a text box, length unknown');
    return out(45, 15, 120, 'unknown', 'no description');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {sizeHints}; else root.sizeHints = sizeHints;
})(typeof window !== 'undefined' ? window : globalThis);
;(function(){
  const __lm = learnedMins;
  learnedMins = function(e){
    const r = __lm(e);
    if (r.level !== 'guess' || (store.effortOv || {})[e.id] != null || ((store.seriesRules || {})[seriesKey(e.title, e.course) || ''] || {}).effort) return r;
    const x = e.ext || {}, h = sizeHints({t: e.title, st: x.st || '', pts: x.pts, k: e.kind, desc: e.desc || x.desc || ''});
    if (!(h.mins > 0)) return r;
    const guessed = h.src !== 'explicit' && h.src !== 'meta', m = guessed ? Math.min(h.mins, 360) : h.mins;   // a guessed length never books more than a working day
    return Object.assign({}, r, {mins: Math.max(5, Math.round(m / 5) * 5), src: 'hint', hint: h});
  };
})();
