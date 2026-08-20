#!/usr/bin/env python3
"""build_images.py — גרסאות קטנות לתמונות כרטיסי השירותים בעמוד הבית.

הבעיה שהסקריפט פותר (אובחן 20.8.2026): שלוש תמונות כרטיסי השירותים נשלחו
בגודל אחד לכל מכשיר — 900-1080px לרוחב, לתוך משבצת של 331px בנייד — וגם
ירדו מיד, למרות שהן יושבות 1081px מתחת לקיפול. לייטהאוס מדד 539 KiB
מיותרים ו-2,690ms.

⚠️ הקובץ הגדול הקיים (images/foo.webp) *לא נוגעים בו*. נבדק ונמצא שהוא כבר
דחוס היטב — ניסיון לקודד אותו מחדש ב-q78 החזיר קובץ גדול ב-33% ממנו. הוא
נשאר השלב העליון של ה-srcset, כך שרטינה בדסקטופ מקבלת בדיוק את מה שהיא
מקבלת היום. כל הרווח מגיע מהשלבים הקטנים, שלא היו קיימים.

שימוש:
  python3 build_images.py          # יבש: מדווח מה ייווצר
  python3 build_images.py --write  # מייצר בפועל
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
QUALITY = 70          # נבחר במדידה: בלתי-מובחן ברוחב 400-660, ~20% קל מ-q78
# 720 ולא 660 בכוונה: טלפון ברוחב 390 עם DPR 2 צריך (390-44)×2 = 692px.
# עם מדרגת 660 הדפדפן היה מדלג עליה ובוחר את קובץ ה-900 — כלומר מחלקת
# המכשירים הנפוצה ביותר לא הייתה מרוויחה כלום. 720 תופסת אותה בדיוק.
WIDTHS = (400, 720)   # 900/1080 = הקובץ הקיים, לא נוצר כאן

# יעד קיים -> המקור הגדול ביותר שיש לנו
TARGETS = {
    "images/yuval-rosio.webp":      "images-backup/yuval-rosio.jpg",
    "images/gallery/IMG_6998.webp": "images-backup/gallery/IMG_6998.JPG",
    "images/IMG_0074.webp":         "images-backup/IMG_0074.JPG",
}


def main():
    write = "--write" in sys.argv
    total = 0
    for target, src in TARGETS.items():
        srcp = os.path.join(ROOT, src)
        if not os.path.exists(srcp):
            print(f"  ✖ מקור חסר: {src}")
            continue
        stem = target[: -len(".webp")]
        for w in WIDTHS:
            out = f"{stem}-{w}.webp"
            outp = os.path.join(ROOT, out)
            if not write:
                print(f"  → ייווצר {out}")
                continue
            subprocess.run(
                ["cwebp", "-quiet", "-q", str(QUALITY), "-resize", str(w), "0",
                 "-m", "6", srcp, "-o", outp],
                check=True,
            )
            kb = os.path.getsize(outp) / 1024
            total += kb
            print(f"  ✓ {out:42s} {kb:6.1f} KiB")
    if write:
        print(f"\nסה\"כ {total:.0f} KiB בשש הגרסאות הקטנות.")
    else:
        print("\nהרץ עם --write ליישום.")


if __name__ == "__main__":
    main()
