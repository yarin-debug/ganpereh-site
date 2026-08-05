#!/usr/bin/env python3
"""מייצר את מניפסט איורי המנות של מתכנן הארוחות.

── למה מניפסט ולא פשוט לנסות לטעון ─────────────────────────────────────
הדפדפן לא יכול לשאול "האם הקובץ הזה קיים" בלי לבקש אותו. בלי מניפסט, כל
מנה שאין לה איור הייתה מייצרת בקשה שנכשלת ב-404 — עשרות שגיאות אדומות
בקונסולה בכל פתיחה של הבורר, ורעש שמסתיר תקלות אמיתיות. הרשימה נבנית
כאן פעם אחת מהקבצים שבתיקייה, והאפליקציה שואלת אותה במקום את הרשת.

── הרצה ────────────────────────────────────────────────────────────────
    python3 build_dish_art.py            # הרצה יבשה, מדווחת מה ישתנה
    python3 build_dish_art.py --write    # מיישם

אחרי כל הוספה או הסרה של איור — להריץ, ולהעלות את VERSION ב-app/sw.js
(js/dish-art.js הוא חלק מהשלד).
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
ART_DIR = ROOT / "app" / "images" / "dishes"
OUT = ROOT / "app" / "js" / "dish-art.js"
DATA = ROOT / "app" / "js" / "data.js"

HEADER = '''/* מניפסט איורי המנות — מיוצר על ידי build_dish_art.py.

   אל תערוך ביד: הרצה הבאה של הסקריפט תדרוס.

   האיור הוא שכבת הביניים בשרשרת של שלוש: תמונה שירין צילם גוברת עליו,
   והוא גובר על אריח האות. מנה שמישהו הוסיף בעצמו לא תופיע כאן לעולם,
   ולכן היא נופלת לאריח — וזה בדיוק הנכון. */

const SLUGS = new Set([
{entries}
]);

/**
 * כתובת האיור המובנה של מנה, או null כשאין לה אחד.
 *
 * הבדיקה מול הרשימה ולא מול הרשת: בקשה שנכשלת ב-404 על כל מנה בלי
 * איור הייתה ממלאת את הקונסולה ברעש שמסתיר תקלות אמיתיות.
 */
export function dishArtUrl(dishId) {{
  const slug = String(dishId || "").replace(/^dish\\./, "");
  return SLUGS.has(slug) ? `images/dishes/${{slug}}.webp` : null;
}}
'''


def catalog_slugs():
    """מזהי המנות שבקטלוג, בלי הקידומת."""
    text = DATA.read_text(encoding="utf-8")
    block = re.search(r"export const DISHES\s*=\s*\[(.*?)\n\];", text, re.S)
    if not block:
        sys.exit("לא נמצא בלוק DISHES ב-data.js")
    return {m for m in re.findall(r'id:\s*"dish\.([a-z0-9_]+)"', block.group(1))}


def main():
    write = "--write" in sys.argv

    if not ART_DIR.exists():
        sys.exit(f"אין תיקיית איורים: {ART_DIR}")

    found = sorted(p.stem for p in ART_DIR.glob("*.webp"))
    known = catalog_slugs()

    # איור בלי מנה מתאימה הוא כמעט תמיד שגיאת הקלדה בשם הקובץ, והוא
    # ייכשל בשקט — הקובץ יושב בתיקייה ולעולם לא ייטען. עדיף לצעוק.
    orphans = [s for s in found if s not in known]
    if orphans:
        print("⚠ איורים בלי מנה תואמת בקטלוג:")
        for s in orphans:
            print(f"    images/dishes/{s}.webp")
        print("  בדוק את שם הקובץ מול המזהה ב-data.js.")

    linked = [s for s in found if s in known]
    entries = "\n".join(f'  "{s}",' for s in linked)
    out = HEADER.format(entries=entries)

    missing = sorted(known - set(linked))
    print(f"\n{len(linked)} איורים מקושרים · {len(missing)} מנות עדיין בלי איור")
    if missing:
        print("  ללא איור: " + ", ".join(missing))

    current = OUT.read_text(encoding="utf-8") if OUT.exists() else None
    if current == out:
        print("\nהמניפסט מעודכן — אין מה לשנות.")
        return

    if not write:
        print(f"\nהרצה יבשה. להחיל: python3 {Path(__file__).name} --write")
        return

    OUT.write_text(out, encoding="utf-8")

    # prettier רץ כאן ולא נשאר לבן אדם: הוא מכווץ את ה-Set לשורה אחת
    # כשהוא נכנס, ופורס אותו כשלא. בלי ההרצה הזו כל שינוי במספר
    # האיורים היה מייצר דיף של פורמט על קובץ שאיש לא ערך.
    try:
        subprocess.run(
            ["npx", "--yes", "prettier@3", "--write", str(OUT)],
            cwd=ROOT, check=True, capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("⚠ prettier לא רץ — הריצו ידנית: npx prettier@3 --write app/js/dish-art.js")

    print(f"\nנכתב: {OUT.relative_to(ROOT)}")
    print("זכור להעלות VERSION ב-app/sw.js.")


if __name__ == "__main__":
    main()
