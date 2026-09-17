#!/usr/bin/env python3
"""build_service_projects.py — מזריק כרטיסי פרויקט מקושרים לעמודי השירות.

עד היום סקשן הפרויקטים בכל עמוד שירות היה רשת של שש תמונות בודדות
**בלי ולו קישור אחד**, בזמן שאותן עבודות קיימות כעמודי פרויקט מלאים
במקום אחר באתר. לקוח שהתעניין במרפסת ראה שש תמונות שלא מובילות לשום
מקום, ואם רצה לראות עוד היה צריך לצאת לארכיון של כל הפרויקטים ולחפש
בעצמו. זה הקובץ שסוגר את הפער.

מקור האמת לפרויקטים הוא PROJECTS ב-build_projects.py, ומקור האמת
לתמונות הוא manifest.json שנוצר מתיקיית המקור. כאן נקבע רק **אילו**
פרויקטים יושבים בכל עמוד ובאיזה סדר.

הרצה:
  python3 build_service_projects.py          # יבש, מדווח מה ישתנה
  python3 build_service_projects.py --write
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
from build_projects import PROJECTS, dims  # noqa: E402

BY_SLUG = {p["slug"]: p for p in PROJECTS}

# ⚠️ הרשימות ידניות ולא נגזרות מ-cat, וזו החלטה: לעמוד המרפסות ולעמוד
# הפנטהאוז יש אותה קטגוריה אבל לא אותו קהל, ולעמוד התחזוקה אין
# קטגוריה בכלל — הוא נבנה מלקוחות התחזוקה הפעילים. גזירה אוטומטית
# הייתה נותנת לשני העמודים הראשונים בדיוק אותה רשימה.
PAGES = {
    "ginot-karka.html": ["yuval", "baruch-agadati", "ramat-hahayal",
                         "moshav-hatzav", "weizmann", "shoham-garden"],
    "mirpeset.html": ["mirpeset-hamishtala", "alexander-pen", "ruth-ramat-gan",
                      "graytzer", "king-george"],
    "penthouse.html": ["graytzer", "alexander-pen", "king-george",
                       "mirpeset-hamishtala"],
    "misradim.html": ["bny-offices", "empathy-offices", "nine-cloud"],
    "asakim.html": ["cafe-nahat", "cafe-ada", "myki-store",
                    "king-george", "ben-shprut"],
    "tichnun-ginot.html": ["yuval", "graytzer", "weizmann"],
    # לקוחות תחזוקה פעילים בלבד. הכותרת בעמוד כבר אומרת "גינות שאנחנו
    # שומרים עליהן", ולכן מה שיושב שם חייב להיות נכון ולא מייצג.
    "tahzukat-ginot.html": ["myki-store", "graytzer", "cafe-nahat", "bny-offices"],
}

START = "<!-- כרטיסי פרויקט — נוצר ע\"י build_service_projects.py. לא לערוך ידנית -->"
END = "<!-- סוף כרטיסי פרויקט -->"


def card(slug):
    p = BY_SLUG[slug]
    thumb = f"images/projects/{slug}/thumb.webp"
    mf_path = os.path.join(ROOT, "images", "projects", slug, "manifest.json")
    alt = p["title"]
    if os.path.exists(mf_path):
        with open(mf_path, encoding="utf-8") as f:
            alt = json.load(f).get("cover_alt") or alt
    return f"""      <div class="lp-grid-item">
        <a class="lp-proj" href="project-{slug}.html">
          <img src="{thumb}" alt="{alt}" loading="lazy"{dims(thumb)} />
          <span class="lp-proj-cap"><strong>{p['title']}</strong>{p['meta']}</span>
        </a>
      </div>"""


def block(slugs):
    inner = "\n".join(card(s) for s in slugs)
    return f'{START}\n    <div class="lp-grid">\n{inner}\n    </div>\n    {END}'


def main():
    write = "--write" in sys.argv
    for page, slugs in PAGES.items():
        path = os.path.join(ROOT, page)
        s = open(path, encoding="utf-8").read()
        missing = [x for x in slugs if x not in BY_SLUG]
        if missing:
            print(f"✖ {page}: פרויקטים שאינם קיימים — {missing}")
            continue
        # הרצה חוזרת מחליפה את הבלוק שנוצר; הרצה ראשונה מחליפה את רשת
        # התמונות הבודדות שהייתה שם.
        if START in s:
            new = re.sub(re.escape(START) + r".*?" + re.escape(END), block(slugs), s, flags=re.S)
        else:
            m = re.search(r'<div class="lp-grid">.*?</div>\s*(?=</section>)', s, re.S)
            if not m:
                print(f"✖ {page}: לא נמצאה רשת תמונות להחלפה")
                continue
            new = s[: m.start()] + block(slugs) + s[m.end():]
        n = len(slugs)
        if new == s:
            print(f"= {page}: ללא שינוי ({n} כרטיסים)")
        else:
            print(f"✓ {page}: {n} כרטיסים מקושרים")
            if write:
                open(path, "w", encoding="utf-8").write(new)
    if not write:
        print("\n(ריצה יבשה. להרצה בפועל: --write)")


if __name__ == "__main__":
    main()
