#!/usr/bin/env python3
"""תמונות השאלון — מקור: תמונות-האתר/שאלון/, יעד: images/quiz/.

הבחירה בין המועמדות בכל תיקייה נעשית ידנית ונרשמת ב-PICK. הסיבה שהיא
לא אוטומטית: הקריטריון אינו חדות או משקל אלא "האם החיתוך עדיין אומר
'מרפסת'", וזה שיפוט ולא מדד.

כל תמונה נשמרת ב-420×560 (כרטיס הבחירה, 104×139 CSS ברוחב עד 4x).

⚠️ עד 5.9.2026 היה כאן גם גודל `hero` (900×1200) לתמונת גיבור במסך
התוצאה. הוסר באותו יום — תמונה לאורך בתוך הקשת של `.q-result-hero img`
לא נראתה טוב (ר' ההערה ב-`quiz/js/screens/result.js`). אם התמונה
חוזרת, צריך גם לפתור את החיתוך בקשת וגם להוסיף בחזרה את `HERO`/
`HERO_KB` ואת `"hero"` ל-PICK.

הדחיסה נקבעת לפי תקציב משקל ולא לפי דרגת איכות קבועה — אותה דרגה
מייצרת 90KB מצילום נקי ו-300KB מקיר עלווה, וצילומי הגינות הם בדיוק
עלווה.

⚠️ אבל לתקציב יש **רצפת איכות**, וזה ההבדל מהסקריפט של עמודי
הפרויקטים. בלעדיה שתי תמונות עלווה צנחו ל-q41 כדי להיכנס למספר —
כלומר התמונה נהרסה בשביל יעד משקל שאיש לא ירגיש. מתחת ל-Q_FLOOR
הסקריפט מפסיק להוריד, שומר את האיכות, ומדווח על החריגה. משקל הוא
יעד; תמונה מרוחה היא פגם.

    python3 build_quiz_images.py            בדיקה יבשה
    python3 build_quiz_images.py --write    כתיבה
"""
import os, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "תמונות-האתר", "שאלון")
OUT = os.path.join(ROOT, "images", "quiz")
CARD = (420, 560)
CARD_KB = 55
Q_FLOOR = 62  # רצפת איכות — ר' ההסבר בראש הקובץ

# slug ← תיקיית מקור, הקובץ שנבחר — כולם כרטיס בלבד (ר' ההסבר למעלה
# על ירידת גודל ה-hero). "11 תוצאה-עסק" ו-"12 תוצאה-בניין" ירדו
# מכאן לגמרי ועברו ל-`_לא-בשימוש/` — הן שימשו רק את ה-hero.
PICK = {
    "balcony":   ("01 מרפסת",     "IMG_3873.JPG"),
    "roof":      ("02 גג",         "a378e4c6-354f-46ac-ad3d-04a48df53278.JPG"),
    "penthouse": ("03 פנטהאוז",    "IMG_6998.JPG"),
    "garden":    ("04 גינה-פרטית", "IMG_2562.JPG"),
    "business":  ("05 עסק-ומשרד",  "IMG_0032.jpg"),
    "building":  ("06 שטח-משותף",  "IMG_4546.JPG"),
}

def encode(im, path, write, budget):
    """מוריד איכות עד שהקובץ נכנס לתקציב. מחזיר (KB, איכות)."""
    for q in range(86, Q_FLOOR - 1, -3):
        if write:
            im.save(path, "WEBP", quality=q, method=6)
            kb = os.path.getsize(path) / 1024
        else:
            import io
            b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6)
            kb = len(b.getvalue()) / 1024
        if kb <= budget:
            return kb, q
    return kb, q

def main():
    write = "--write" in sys.argv
    if write:
        os.makedirs(OUT, exist_ok=True)
    problems = 0
    for slug, (folder, fname) in PICK.items():
        src = os.path.join(SRC, folder, fname)
        if not os.path.exists(src):
            print(f"  ✖ {slug:17s} חסר: {folder}/{fname}")
            problems += 1
            continue
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        w, h = im.size
        note = ""
        if w > h:
            note = "  ⚠️ הקובץ לרוחב — הכרטיס 3:4 יחתוך אותו"
        if max(w, h) < 1600:
            note += f"  ⚠️ רק {max(w,h)}px בצד הארוך (מומלץ 1600+)"
        mark = "✓" if write else "→"
        name = slug + "-card.webp"
        out = ImageOps.fit(im, CARD, Image.LANCZOS, centering=(0.5, 0.5))
        kb, q = encode(out, os.path.join(OUT, name), write, CARD_KB)
        over = f"  ⚠️ מעל התקציב ({CARD_KB}KB) — נעצר ברצפת האיכות" if kb > CARD_KB else ""
        print(f"  {mark} {name:26s} {kb:5.1f} KB (q{q}){over}{note}")
    print(f"\n{len(PICK) - problems}/{len(PICK)} תמונות" + ("" if write else "  — יבש, הרץ עם --write"))
    return 1 if problems else 0

if __name__ == "__main__":
    sys.exit(main())
