#!/usr/bin/env python3
"""build_assets.py — חבילת CSS אחת לכל עמוד, מוקטנת.

הבעיה (אובחן 20.8.2026): כל עמוד טען 1-3 גיליונות נפרדים, כולם חוסמי-רינדור,
וכולם נמסרו כמו שנכתבו — כולל הערות. בעמוד הבית זה היה 24.1 KiB דחוסים
בשלוש הלוך-ושוב לשרת.

הסקריפט מאחד כל צירוף לחבילה אחת מוקטנת ומפנה את העמודים אליה.
הרווח בעמוד הבית: 24.1 → 12.1 KiB דחוסים, ושלוש בקשות במקום אחת.

⚠️ קובצי assets/*.min.css נוצרים אוטומטית — אין לערוך אותם. מקור האמת
הוא shared.css / index.css / projects.css / lp.css. כל שינוי בהם מחייב
הרצה מחדש של הסקריפט, אחרת האתר יגיש את הגרסה הישנה.

שימוש:
  python3 build_assets.py          # יבש: מדווח מה ישתנה
  python3 build_assets.py --write  # מיישם
"""
import os, re, subprocess, sys, glob, gzip

ROOT = os.path.dirname(os.path.abspath(__file__))
ESBUILD = os.path.join(ROOT, "node_modules/.bin/esbuild")
# ⚠️ החבילות יושבות בשורש ולא בתת-תיקייה, בכוונה: כל `url()` בתוך ה-CSS
# (15 מופעים — פונטים ותמונות רקע) נפתר יחסית *לקובץ ה-CSS*. גרסה
# ראשונה כתבה ל-assets/, וכל הפונטים חזרו 404 בלי שאף כלל CSS השתנה
# ובלי שהפריסה זזה — התסמין היחיד היה טקסט בפונט נפילה.
OUTDIR = "."

# צירוף הגיליונות (לפי סדר הטעינה בעמוד) -> שם החבילה
GROUPS = {
    ("shared.css",):                              "base",
    ("shared.css", "lp.css"):                     "lp",
    ("shared.css", "index.css", "projects.css"):  "home",
    ("shared.css", "lp.css", "projects.css"):     "proj",
}

LINK = re.compile(r'([ \t]*)<link rel="stylesheet" href="(/?[\w.-]+\.css)"\s*/?>\n')


def page_sheets(html):
    """מחזיר (כל הגיליונות לפי סדר, רשימת ההתאמות).

    ⚠️ הקישורים אינם בהכרח צמודים: ב-asakim.html וב-ginot-karka.html
    בלוק פיקסל מטא יושב בין shared.css ל-lp.css. גרסה ראשונה של
    הסקריפט קטעה ברצף הצמוד, זיהתה את העמודים כ-base, והייתה מפילה
    את lp.css בשקט — עמוד נחיתה בתשלום בלי העיצוב שלו.
    """
    ms = list(LINK.finditer(html))
    if not ms:
        return None
    return tuple(m.group(2).lstrip("/") for m in ms), ms


def main():
    write = "--write" in sys.argv
    if write and not os.path.exists(ESBUILD):
        sys.exit("esbuild חסר. הרץ: npm install")

    # ── 1. בניית החבילות ──
    built = {}
    for sheets, name in GROUPS.items():
        out = f"bundle-{name}.min.css"
        outp = os.path.join(ROOT, out)
        if write:
            merged = "\n".join(
                open(os.path.join(ROOT, s), encoding="utf-8").read() for s in sheets
            )
            tmp = os.path.join(ROOT, f"_{name}.src.css")
            open(tmp, "w", encoding="utf-8").write(merged)
            subprocess.run([ESBUILD, tmp, "--minify", f"--outfile={outp}",
                            "--loader:.css=css", "--log-level=error"], check=True)
            os.remove(tmp)
            gz = len(gzip.compress(open(outp, "rb").read(), 6)) / 1024
            raw_gz = len(gzip.compress(merged.encode(), 6)) / 1024
            print(f"  ✓ {out:26s} {os.path.getsize(outp)/1024:6.1f} KiB "
                  f"({gz:5.1f} KiB דחוס, היה {raw_gz:5.1f})")
        else:
            print(f"  → תיבנה {out}  ({' + '.join(sheets)})")
        built[sheets] = out

    # ── 2. הפניית העמודים ──
    changed = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        html = open(path, encoding="utf-8").read()
        found = page_sheets(html)
        if not found:
            continue
        sheets, ms = found
        out = built.get(sheets)
        if not out:
            print(f"  ? {os.path.basename(path)}: צירוף לא מוכר {sheets}")
            continue
        # 404.html מוגש מכל נתיב ולכן חייב נתיב מוחלט
        href = "/" + out if os.path.basename(path) == "404.html" else out
        indent = ms[0].group(1)
        first = f'{indent}<link rel="stylesheet" href="{href}" />\n'
        if len(ms) == 1 and ms[0].group(0) == first:
            continue
        changed += 1
        if write:
            # מהסוף להתחלה, כדי שהאינדקסים לא יזוזו
            out_html = html
            for m in reversed(ms[1:]):
                out_html = out_html[: m.start()] + out_html[m.end() :]
            out_html = out_html[: ms[0].start()] + first + out_html[ms[0].end() :]
            open(path, "w", encoding="utf-8").write(out_html)
        print(f"  {'✓' if write else '→'} {os.path.basename(path):34s} "
              f"{len(sheets)} קישורים ← {href}")

    print(f"\n{changed} עמודים {'עודכנו' if write else 'יעודכנו'}."
          f"{'' if write else ' הרץ עם --write ליישום.'}")


if __name__ == "__main__":
    main()
