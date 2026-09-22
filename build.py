#!/usr/bin/env python3
"""build.py — מקור-אמת יחיד לניווט, לפוטר ול-lastmod של sitemap.xml באתר גן פרא.

התפריט (‎<nav> + מגירת המובייל) והפוטר זהים בכל עמודי המשנה. במקום לתחזק 22 עותקים,
הם נשמרים פעם אחת ב-partials/nav.html ו-partials/footer.html, והסקריפט הזה מזריק אותם
לכל העמודים. ה-HTML נשאר סטטי (טוב ל-SEO) — אין הזרקת JS.

בסוף הריצה הסקריפט גם מיישר את lastmod בכל שורת sitemap.xml למועד הקומיט האחרון
בפועל של כל קובץ — כדי שגל עבודה שמשנה עמודים לא ישאיר את הסייטמאפ מצהיר תאריך ישן
(ר' sync_sitemap_lastmod למטה).

שימוש:
  python3 build.py            # הרצה יבשה: מדווח מה ישתנה, לא כותב
  python3 build.py --write    # מיישם בפועל

לשינוי התפריט/הפוטר: עורכים את partials/*.html ומריצים `python3 build.py --write`.
index.html, 5.html, quiz.html, landing-misradim.html — ללא התפריט המשותף (לא נגעים).
404.html — נתיבים אבסולוטיים (מוגש מכל נתיב), הסקריפט ממיר אוטומטית.
"""
import re, glob, sys, os, subprocess

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


def sitemap_path_to_file(loc):
    """כתובת מלאה מה-sitemap -> שם קובץ יחסי לשורש. '' /'/' -> index.html."""
    path = loc.replace("https://ganpereh.co.il/", "")
    if path == "" or path.endswith("/"):
        path = path + "index.html"
    if not path.endswith(".html"):
        path = path + ".html"
    return path


def git_last_commit_date(path):
    """תאריך הקומיט האחרון שנגע בקובץ (ISO, יום). None אם הקובץ לא במאגר."""
    try:
        out = subprocess.check_output(
            ["git", "log", "-1", "--format=%ad", "--date=short", "--", path],
            cwd=ROOT, stderr=subprocess.DEVNULL,
        ).decode().strip()
        return out or None
    except subprocess.CalledProcessError:
        return None


def sync_sitemap_lastmod(write):
    """מיישר lastmod בכל שורת sitemap.xml למועד הקומיט האחרון בפועל של הקובץ.

    נולד מתקלה שחזרה שלוש פעמים (12.8, 26.8, 22.9): גל עבודה משנה עמודים,
    ה-sitemap ממשיך להצהיר תאריך ישן, וגוגל רואה "לא השתנה" בדיוק בעמודים
    שממתינים לאינדוקס. במכוון לא משתמשים בתאריך של היום — lastmod מזויף
    שוחק את אמון גוגל בשדה; הקובץ תמיד משקף את מה שבאמת קיים במאגר.
    """
    sm_path = os.path.join(ROOT, "sitemap.xml")
    content = open(sm_path, encoding="utf-8").read()
    changed = 0

    def repl(m):
        nonlocal changed
        loc, old_lastmod = m.group(1), m.group(2)
        fname = sitemap_path_to_file(loc)
        actual = git_last_commit_date(fname)
        if not actual or actual == old_lastmod:
            return m.group(0)
        changed += 1
        return f"<loc>{loc}</loc>\n    <lastmod>{actual}</lastmod>"

    new_content = re.sub(
        r"<loc>(https://ganpereh\.co\.il/[^<]*)</loc>\s*<lastmod>([^<]*)</lastmod>",
        repl, content,
    )
    if changed and write:
        open(sm_path, "w", encoding="utf-8").write(new_content)
    print(f"\nsitemap.xml: {changed} כתובות {'עודכנו' if write else 'ישתנו'} (lastmod). WRITE={write}")
    return changed


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
    sync_sitemap_lastmod(write)
    return failed


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
