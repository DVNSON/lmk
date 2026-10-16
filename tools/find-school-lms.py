#!/usr/bin/env python3
"""Find each school's learning platform by asking the platform's own servers.

Input: a CSV with id,name,region,url (the school's website). Output: one JSON line per school with every platform found.
A platform counts only when its server answers in a way only that platform does:
  Brightspace  GET /d2l/api/versions/      -> 200, a JSON list with ProductCode   (D2L's public route)
  Canvas       GET /api/v1/users/self      -> 401 with "user authorization required" (Canvas's own message)
  Blackboard   GET /webapps/login/         -> 200, page names Blackboard
  Moodle       GET /login/index.php        -> 200, page carries Moodle's own markers
A host on the school's own domain belongs to the school. A guessed vendor host (<name>.instructure.com, .brightspace.com,
.blackboard.com) counts only if its login sends you to the school's domain or its page names that domain.
Usage: python3 tools/find-school-lms.py schools.csv out.jsonl [threads]   (then tools/build-school-list.py)
The school lists: the US Department of Education's IPEDS directory (HD<year>.zip, degree-granting and active) and Wikidata's
Canadian universities and colleges; both are rebuilt into schools.csv by hand (id,name,region,city,url), see ~/lmk-docs/app.md.
"""
import csv, json, re, socket, ssl, sys, threading, time, random, string, urllib.request, urllib.error
import concurrent.futures as cf

UA = "Mozilla/5.0 (compatible; LMK-school-finder/1.0; +https://lmktoday.app; hello@lmktoday.app)"
socket.setdefaulttimeout(8)
CTX = ssl.create_default_context()
OWN = ["canvas", "d2l", "brightspace", "elearning", "learn", "mycourses", "courses", "online", "lms", "moodle",
       "blackboard", "bb", "ilearn", "icollege", "courselink", "elearn", "mylearning"]
PARENT_OWN = ["canvas", "d2l", "brightspace", "elearning", "learn", "mycourses", "moodle", "blackboard"]
VENDOR = ["instructure.com", "brightspace.com", "blackboard.com"]
LMS_WORD = re.compile(r"canvas|instructure|d2l|brightspace|blackboard|moodle|mycourses|elearn|learn|lms|icollege|ilearn|courselink|carmen|bruinlearn|courses", re.I)
STOP = {"of", "the", "and", "at", "in", "for", "de", "la", "del", "campus", "main", "&", "-"}
def initials(name):
    words = [w for w in re.split(r"[\s\-/,]+", re.sub(r"\(.*?\)", "", name.lower())) if w and w not in STOP]
    return "".join(w[0] for w in words if w[0].isalpha())[:8]

def homepage_hosts(url, base):
    """LMS-looking hosts the school's own homepage links to: the school vouches for them."""
    u = url.strip()
    if not re.match(r"^https?://", u): u = "https://" + u
    s, fu, b = fetch(u, 600000)
    if not b:
        s, fu, b = fetch(f"https://www.{base}/", 600000)
    out = []
    for h in re.findall(r"""(?:href|src)\s*=\s*["']https?://([a-z0-9.-]+)""", b or "", re.I):
        h = h.lower().strip(".")
        if LMS_WORD.search(h) and "." in h and h not in out and not re.search(r"(google|facebook|youtube|twitter|linkedin|instagram|apple|microsoft|cdn)", h): out.append(h)
    return out[:12]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    pass

def fetch(url, limit=200000):
    """(status, final_url, body) — never raises."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
            return r.status, r.geturl(), r.read(limit).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try: body = e.read(limit).decode("utf-8", "replace")
        except Exception: body = ""
        return e.code, e.geturl() if hasattr(e, "geturl") else url, body
    except Exception:
        return 0, url, ""

_dns, _dns_lock = {}, threading.Lock()
def ips(host):
    with _dns_lock:
        if host in _dns: return _dns[host]
    try: v = frozenset(a[4][0] for a in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP))
    except Exception: v = frozenset()
    with _dns_lock: _dns[host] = v
    return v

_host, _host_lock = {}, threading.Lock()
def detect(host):
    """The platform a host's own server says it is, or None. Cached: branch campuses share hosts."""
    with _host_lock:
        if host in _host: return _host[host]
    res = None
    s, fu, b = fetch(f"https://{host}/d2l/api/versions/")
    if s == 200:
        try:
            j = json.loads(b)
            if isinstance(j, list) and any(isinstance(x, dict) and "ProductCode" in x for x in j): res = ("d2l", host)
        except Exception: pass
    if not res:
        s, fu, b = fetch(f"https://{host}/api/v1/users/self")
        if s == 401 and "user authorization required" in b: res = ("canvas", host)
    if not res:
        s, fu, b = fetch(f"https://{host}/webapps/login/")
        if s == 200 and re.search(r"blackboard", b, re.I) and re.search(r"webapps|bb-|learn", b, re.I): res = ("blackboard", host)
    if not res:
        s, fu, b = fetch(f"https://{host}/login/index.php")
        if s == 200 and re.search(r"M\.cfg|moodle-|/theme/[a-z_]+/|moodle", b) and re.search(r"moodle", b, re.I): res = ("moodle", host)
    with _host_lock: _host[host] = res
    return res

def owned(host, domains, kind):
    """A vendor-hosted guess is the school's only if its login lands on, or its page names, the school's domain."""
    path = {"canvas": "/login", "d2l": "/d2l/login", "blackboard": "/webapps/login/"}.get(kind, "/")
    s, fu, b = fetch(f"https://{host}{path}")
    final = re.sub(r"^https?://([^/:]+).*$", r"\1", fu or "").lower()
    for d in domains:
        if final == d or final.endswith("." + d): return True
        if re.search(r"(^|[^a-z0-9.-])" + re.escape(d) + r"([^a-z0-9-]|$)", b, re.I): return True
    return False

def base_of(url):
    h = re.sub(r"^[a-z]+://", "", url.strip().lower()).split("/")[0].split(":")[0].strip(".")
    h = re.sub(r"^www\d?\.", "", h)
    return h

def school(row):
    base = base_of(row["url"])
    if not base or "." not in base: return dict(row, base=base, found=[])
    labels = base.split(".")
    parent = ".".join(labels[-2:]) if len(labels) > 2 and labels[-1] in ("edu", "com", "org", "net", "us", "ca") else base
    if labels[-1] == "ca" and len(labels) > 2: parent = ".".join(labels[-2:])
    domains = sorted({base, parent})
    lbl = labels[0]
    ini = initials(row["name"])
    # wildcard DNS: a made-up name resolving means every guess resolves; skip guesses that land on that same address
    junk = "lmk" + "".join(random.choice(string.ascii_lowercase) for _ in range(10))
    wild = set()
    for d in domains:
        wild |= set(ips(f"{junk}.{d}"))
    cands = [f"{p}.{base}" for p in OWN] + ([f"{p}.{parent}" for p in PARENT_OWN] if parent != base else [])
    found, seen = [], set()
    for h in dict.fromkeys(cands):
        a = ips(h)
        if not a or (wild and a <= wild): continue
        r = detect(h)
        if r and r not in seen: seen.add(r); found.append({"lms": r[0], "host": r[1], "via": "own"})
    for h in homepage_hosts(row["url"], base):
        if h in cands or not ips(h): continue
        r = detect(h)
        if r and r not in seen: seen.add(r); found.append({"lms": r[0], "host": r[1], "via": "link"})
    for v in VENDOR:
        for l in dict.fromkeys([lbl, ini] if len(ini) >= 2 else [lbl]):
            h = f"{l}.{v}"
            if not ips(h): continue
            r = detect(h)
            if r and r not in seen and owned(h, domains, r[0]): seen.add(r); found.append({"lms": r[0], "host": r[1], "via": "vendor"})
    return dict(row, base=base, found=found)

def main():
    src, out = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 96
    rows = list(csv.DictReader(open(src, encoding="utf-8")))
    done = set()
    try:
        for line in open(out): done.add(json.loads(line)["id"])
    except FileNotFoundError: pass
    todo = [r for r in rows if r["id"] not in done]
    print(f"{len(rows)} schools, {len(todo)} to probe, {n} threads", flush=True)
    t0, k = time.time(), 0
    with open(out, "a") as fo, cf.ThreadPoolExecutor(n) as ex:
        for res in ex.map(school, todo):
            fo.write(json.dumps(res) + "\n"); fo.flush(); k += 1
            if k % 200 == 0: print(f"{k}/{len(todo)}  {time.time()-t0:.0f}s", flush=True)
    print(f"done {k} in {time.time()-t0:.0f}s", flush=True)

if __name__ == "__main__":
    main()
