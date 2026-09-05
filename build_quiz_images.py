#!/usr/bin/env python3
"""תמונות השאלון — מקור: תמונות-האתר/שאלון/, יעד: images/quiz/.

הבחירה בין המועמדות בכל תיקייה נעשית ידנית ונרשמת ב-PICK. הסיבה שהיא
לא אוטומטית: הקריטריון אינו חדות או משקל אלא "האם החיתוך עדיין אומר
'מרפסת'", וזה שיפוט ולא מדד.

שני גדלים לכל תמונה, ולא אחד. הסיבה נמדדה: במסך בחירת החלל נטענות
**שש** תמונות בבת אחת, וקובץ אחד ב-900×1200 לשני התפקידים היה מביא
כ-700KB לטלפון בשביל אריחים של 104px.

  <slug>-card.webp   420×560   כרטיס הבחירה (104×139 CSS, עד 4x)
  <slug>.webp        900×1200  תמונת הגיבור במסך התוצאה

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
HERO = (900, 1200)
CARD_KB = 55
HERO_KB = 200
Q_FLOOR = 62  # רצפת איכות — ר' ההסבר בראש הקובץ

# slug ← (תיקיית מקור, הקובץ שנבחר, אילו גדלים)
#   card — כרטיס במסך בחירת החלל     hero — תמונת הגיבור במסך התוצאה
# עסק ובניין מקבלים כרטיס בלבד: הגיבור שלהם מגיע מ-result-*, כדי שמסך
# הסיום לא יראה בדיוק את אותה תמונה שנלחצה בהתחלה.
PICK = {
    "balcony":         ("01 מרפסת",        "IMG_3802.JPG", ("card", "hero")),
    "roof":            ("02 גג",            "a378e4c6-354f-46ac-ad3d-04a48df53278.JPG", ("card", "hero")),
    "penthouse":       ("03 פנטהאוז",       "IMG_6998.JPG", ("card", "hero")),
    "garden":          ("04 גינה-פרטית",    "IMG_2562.JPG", ("card", "hero")),
    "business":        ("05 עסק-ומשרד",     "IMG_0032.jpg", ("card",)),
    "building":        ("06 שטח-משותף",     "IMG_4546.JPG", ("card",)),
    "result-business": ("11 תוצאה-עסק",     "98DB6F86-5CCF-483A-B01B-F13CCF1DBCCC_1_105_c.jpeg", ("hero",)),
    "result-building": ("12 תוצאה-בניין",   "IMG_4540.JPG", ("hero",)),
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
    for slug, (folder, fname, kinds) in PICK.items():
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
        for kind in kinds:
            size, budget = (CARD, CARD_KB) if kind == "card" else (HERO, HERO_KB)
            name = slug + ("-card" if kind == "card" else "") + ".webp"
            out = ImageOps.fit(im, size, Image.LANCZOS, centering=(0.5, 0.5))
            kb, q = encode(out, os.path.join(OUT, name), write, budget)
            over = f"  ⚠️ מעל התקציב ({budget}KB) — נעצר ברצפת האיכות" if kb > budget else ""
            print(f"  {mark} {name:26s} {kb:5.1f} KB (q{q}){over}")
        if note:
            print(f"      {slug}: {note.strip()}")
    print(f"\n{len(PICK) - problems}/{len(PICK)} תמונות" + ("" if write else "  — יבש, הרץ עם --write"))
    return 1 if problems else 0

if __name__ == "__main__":
    sys.exit(main())
