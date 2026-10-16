#!/usr/bin/env python3
"""Build /assets/schools.json — every school found on Canvas or D2L Brightspace — and print which platform each school uses.

Input: the JSON lines tools/find-school-lms.py writes (one per school: name, region, base domain, every platform its own
servers answered as), and the IPEDS directory file for US college systems. Output rows: [name, host, platform, region].

Which address a school gets, per platform: one on the school's own domain first (canvas.<school>, d2l.<school>, …), then one
its homepage links to, then a vendor address (<name>.instructure.com / .brightspace.com) proven to be the school's, then its
college system's shared address (a system whose members link to one address on a domain none of them own, e.g. the Colorado
Community College System's mycourses.cccs.edu). A school found on both platforms gets two rows, labelled with each.

Usage: python3 tools/build-school-list.py <ipeds HD csv> <out.json> <probe.jsonl> [<probe.jsonl> ...]
"""
import csv, json, re, sys, collections

PRIO = {"own": 0, "link": 1, "vendor": 2, "system": 3}
PREFIX = ["canvas.", "d2l.", "brightspace.", "mycourses.", "elearn.", "elearning.", "learn.", "courses."]
NAME = {"canvas": "Canvas", "d2l": "D2L Brightspace"}

def reg_domain(h):
    p = h.split(".")
    return ".".join(p[-3:]) if len(p) >= 3 and p[-2] in ("ac", "co", "edu", "qc", "on", "bc", "ab") and p[-1] in ("ca", "uk", "au") else ".".join(p[-2:])

def pick(found, lms):
    c = [f for f in found if f["lms"] == lms]
    if not c: return None
    def key(f):
        pre = next((i for i, p in enumerate(PREFIX) if f["host"].startswith(p)), len(PREFIX))
        return (PRIO.get(f["via"], 9), pre, len(f["host"]))
    return sorted(c, key=key)[0]

def main():
    hd, out, probes = sys.argv[1], sys.argv[2], sys.argv[3:]
    system = {}
    for r in csv.DictReader(open(hd, encoding="latin-1")):
        uid = r.get("﻿UNITID") or r.get("ï»¿UNITID") or r.get("UNITID")
        nm = (r.get("F1SYSNAM") or "").strip()
        if uid and nm and nm not in ("-1", "-2", "N/A"): system["us" + uid] = nm
    schools = []
    for p in probes:
        for line in open(p):
            s = json.loads(line)
            if s["id"].startswith("ca"): s["region"] = "Canada"   # "CA" alone would read as California
            schools.append(s)

    # a college system's shared address: members link to it, and it is on a domain no member owns
    shared = collections.defaultdict(lambda: collections.defaultdict(set))
    for s in schools:
        sysn = system.get(s["id"])
        if not sysn: continue
        for f in s["found"]:
            if f["via"] in ("own", "link") and f["lms"] in NAME and reg_domain(f["host"]) != reg_domain(s["base"]):
                shared[sysn][f["lms"]].add(f["host"])
    owned_domains = collections.defaultdict(set)
    for s in schools:
        if system.get(s["id"]): owned_domains[system[s["id"]]].add(reg_domain(s["base"]))
    for s in schools:
        sysn = system.get(s["id"])
        if not sysn: continue
        have = {f["lms"] for f in s["found"]}
        for lms, hosts in shared[sysn].items():
            hosts = {h for h in hosts if reg_domain(h) not in owned_domains[sysn]}
            if len(hosts) == 1 and lms not in have and not ({"blackboard", "moodle"} & have):
                s["found"].append({"lms": lms, "host": next(iter(hosts)), "via": "system"})

    # names: a name used by two schools gets its region; a school on both platforms gets the platform
    count = collections.Counter(s["name"] for s in schools)
    rows, stats = [], collections.Counter()
    for s in schools:
        kinds = {f["lms"] for f in s["found"]}
        stats["schools"] += 1
        for k in ("canvas", "d2l", "blackboard", "moodle"):
            if k in kinds: stats[k] += 1
        if not kinds: stats["none_found"] += 1
        if kinds & {"canvas", "d2l"}: stats["canvas_or_d2l"] += 1
        both = "canvas" in kinds and "d2l" in kinds
        if both: stats["canvas_and_d2l"] += 1
        for lms in ("canvas", "d2l"):
            f = pick(s["found"], lms)
            if not f: continue
            stats["via_" + f["via"]] += 1
            name = s["name"] + (f" ({s['region']})" if count[s["name"]] > 1 and s.get("region") else "") + (f" ({NAME[lms]})" if both else "")
            rows.append([name, f["host"], lms, s.get("region", "")])
    rows.sort(key=lambda r: r[0].lower())
    seen, uniq = set(), []
    for r in rows:
        if r[0] in seen: continue
        seen.add(r[0]); uniq.append(r)
    json.dump(uniq, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(json.dumps(dict(stats, rows=len(uniq)), indent=1))

if __name__ == "__main__":
    main()
