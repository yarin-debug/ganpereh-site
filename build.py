#!/usr/bin/env python3
"""build.py — מקור-אמת יחיד לניווט ולפוטר של אתר גן פרא.

התפריט (‎<nav> + מגירת המובייל) והפוטר זהים בכל עמודי המשנה. במקום לתחזק 22 עותקים,
הם נשמרים פעם אחת ב-partials/nav.html ו-partials/footer.html, והסקריפט הזה מזריק אותם
לכל העמודים. ה-HTML נשאר סטטי (טוב ל-SEO) — אין הזרקת JS.

שימוש:
  python3 build.py            # הרצה יבשה: מדווח מה ישתנה, לא כותב
  python3 build.py --write    # מיישם בפועל

לשינוי התפריט/הפוטר: עורכים את partials/*.html ומריצים `python3 build.py --write`.
index.html, 5.html, quiz.html, landing-misradim.html — ללא התפריט המשותף (לא נגעים).
404.html — נתיבים אבסולוטיים (מוגש מכל נתיב), הסקריפט ממיר אוטומטית.
"""
import re, glob, sys, os

SKIP = {"index.html", "5.html", "quiz.html", "landing-misradim.html"}
ROOT = os.path.dirname(os.path.abspath(__file__))


def balanced_div(s, start):
    """מחזיר אינדקס מיד אחרי ה-</div> התואם ל-<div> שמתחיל ב-start."""
    depth = 0
    for m in re.finditer(r"<div\b|</div>", s[start:]):
        depth += 1 if m.group() == "<div" else -1
        if depth == 0:
            return start + m.end()
    return -1


def nav_region(s):
    """(start, end) של אזור הניווט: מ-<nav> ועד סוף מגירת המובייל."""
    nav = re.search(r"<nav\b", s)
    md = re.search(r'<div class="nav-mobile"', s)
    if not nav or not md:
        return None
    return nav.start(), balanced_div(s, md.start())


def to_absolute(html):
    """נתיבים יחסיים -> אבסולוטיים, עבור 404 בלבד. חיצוניים (http/tel/wa) לא נגעים."""
    def repl(m):
        url = m.group(1)
        if url.startswith(("http", "tel:", "mailto:", "#", "/")):
            return m.group(0)
        if url == "index.html":
            return 'href="/"'
        return 'href="/' + url + '"'
    return re.sub(r'href="([^"]+)"', repl, html)


def linkset(html):
    """סט הקישורים מנורמל ליחסי, להשוואת שקילות."""
    out = set()
    for u in re.findall(r'href="([^"]+)"', html):
        u = re.sub(r'^/(?=[a-zA-Z])', "", u)
        if u == "/":
            u = "index.html"
        out.add(u)
    return out


def main():
    write = "--write" in sys.argv
    nav_partial = open(os.path.join(ROOT, "partials/nav.html"), encoding="utf-8").read().rstrip("\n")
    foot_partial = open(os.path.join(ROOT, "partials/footer.html"), encoding="utf-8").read().rstrip("\n")
    canon = linkset(nav_partial) | linkset(foot_partial)

    changed = failed = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        name = os.path.basename(path)
        if name in SKIP:
            continue
        s = open(path, encoding="utf-8").read()
        reg = nav_region(s)
        foot = re.search(r"<footer\b.*?</footer>", s, re.S)
        if not reg or not foot:
            continue
        nav_new, foot_new = nav_partial, foot_partial
        if name == "404.html":
            nav_new, foot_new = to_absolute(nav_new), to_absolute(foot_new)
        # החלף פוטר קודם (מופיע אחרי הניווט — לא מזיז את אינדקסי הניווט)
        out = s[: foot.start()] + foot_new + s[foot.end():]
        reg2 = nav_region(out)
        out = out[: reg2[0]] + nav_new + out[reg2[1]:]
        # אימות-עצמי: סט הקישורים של הניווט+פוטר בעמוד זהה לקנוני
        new_nav = out[nav_region(out)[0]: nav_region(out)[1]]
        new_foot = re.search(r"<footer\b.*?</footer>", out, re.S).group(0)
        ok = (linkset(new_nav) | linkset(new_foot)) == canon
        if not ok:
            print(f"  ✗ {name}: link-set MISMATCH — לא ייכתב")
            failed += 1
            continue
        if out != s:
            changed += 1
            if write:
                open(path, "w", encoding="utf-8").write(out)
        print(f"  {'✓ wrote' if (write and out!=s) else ('· ok (no change)' if out==s else '✓ would change')}: {name}")
    print(f"\nסה\"כ: {changed} עמודים {'עודכנו' if write else 'ישתנו'}, {failed} כשלי-אימות. WRITE={write}")
    return failed


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
