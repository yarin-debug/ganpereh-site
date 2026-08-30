#!/usr/bin/env python3
"""build_site_images.py — מתיקיית המקור של ירין אל תמונות האתר.

מקור האמת לתמונות הפרויקטים הוא התיקייה  תמונות-האתר/  ולא הקבצים
שב-images/projects/. ירין מסדר שם תיקייה לכל פרויקט, גורר פנימה את
הצילומים שהוא רוצה, והסקריפט הזה מייצר מהם את כל מה שהאתר צריך.

    תמונות-האתר/פרויקטים/<slug> — <שם בעברית>/
        הירו/     תמונה אחת. ממנה נגזרים ההירו לדסקטופ, ההירו למובייל,
                  ואם אין תיקיית שער — גם תמונת השער בארכיון.
        שער/      אופציונלי. תמונה אחת שתשמש ככרטיס בארכיון הפרויקטים.
        גלריה/    התמונות שיופיעו בגלריה שבתחתית עמוד הפרויקט,
                  לפי הסדר המספרי בשם הקובץ.
        ארכיון/   מה שהוצא מהאתר. נשמר ולא נוגעים בו.

שם הקובץ הוא גם הכיתוב החלופי (alt) שנכנס לאתר — חשוב לגוגל ולקוראי
מסך. הפורמט:  ‏"03 פינת ישיבה עם עץ זית וקו הרקיע.jpg"
המספר קובע סדר ויורד מהכיתוב. קובץ בלי טקסט מדווח כחסר-כיתוב.

מיקוד חיתוך: הירו נחתך למלבן רחב, ולכן חשוב איזה חלק מהצילום נשמר.
ברירת המחדל היא המרכז. להטיה — להוסיף לשם הקובץ  #למעלה  או  #למטה.

שימוש:
    python3 build_site_images.py           # יבש: מדווח מה ייווצר
    python3 build_site_images.py --write   # מייצר בפועל
    python3 build_site_images.py --write --only graytzer
    python3 build_site_images.py --check       # רק בודק תקינות
    python3 build_site_images.py --sync-index # מיישר את כרטיסי עמוד הבית

אחרי הרצה עם --write:
    python3 build_projects.py      # בונה מחדש את עמודי הפרויקטים
    python3 build_assets.py --write # מחזיר את העמודים לחבילת ה-CSS
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "תמונות-האתר", "פרויקטים")
OUT = os.path.join(ROOT, "images", "projects")

# ── היעדים. כל שורה: (שם הקובץ, רוחב, גובה) ────────────────────────────
# ההירו לדסקטופ ביחס 2.30 ולא ביחס הצילום: המשבצת היא רוחב-מלא בגובה
# min(72vh, 640px) — כלומר 2.0 במסך 1280 ו-3.0 במסך 1920. קובץ ביחס
# 0.75, כפי שהיה עד היום, הציג 38% מהפריים בלבד.
# 1600×695 ו-820×1180 הם בדיוק המידות של הירו עמוד הבית (מסלול-צילום/
# build-heroes.py), כדי שלא יהיו באתר שתי מוסכמות חיתוך שונות.
HERO_BAND = ("hero.webp", 1600, 695)
HERO_MOBILE = ("hero-mobile.webp", 820, 1180)
# ── הירו לצילום לאורך ────────────────────────────────────────────────
# צילום לאורך ברצועה של 2.30 מציג פרוסה אופקית דקה. במקום זה הוא
# מקבל פריסה מפוצלת — התמונה ביחס שלה בעמודה אחת, הכותרת בשנייה,
# ואפס חיתוך. הרוחב 1000 מספיק לעמודה של ~512px ברטינה.
# היחס נלקח מהצילום עצמו ונחסם ל-[0.60, 0.85]: מתחת ל-0.60 (למשל
# צילום 9:16) העמודה הופכת גבוהה מהמסך — ב-0.66 היא מגיעה ל-813px,
# מול 640px של הרצועה.
HERO_SPLIT_WIDTH = 1000
HERO_SPLIT_RATIO = (0.66, 0.85)
# ── השער בארכיון ─────────────────────────────────────────────────────
# לאורך → 3:4 בעמודה אחת. לרוחב → כרטיס ברוחב שתי עמודות.
# 1.53 ולא 1.50: כרטיס שמשתרע על שתי עמודות ועל גובה שורה אחת יוצא
# (2·col + gap) / (col · 4/3) = 1.532 ברוחב 1200, וכמעט אותו דבר בכל
# רוחב אחר. קובץ ביחס 1.53 יושב במשבצת הזו בחיתוך של פחות מ-0.2%.
THUMB_PORTRAIT = ("thumb.webp", 900, 1200)
THUMB_LANDSCAPE = ("thumb.webp", 1200, 784)
GALLERY_WIDTH = 1200  # הגלריה היא masonry — היחס המקורי נשמר
# לפני/אחרי: שתי התמונות יושבות זו לצד זו ב-object-fit: cover, ולכן
# חייבות לצאת באותו יחס בדיוק. עד היום 'לפני' היה 0.75 ו'אחרי' 1.33
# (ויצמן) או 1.78 (רמת החייל) — הזוג נחתך אנושות בכל טעינה.
BA = ("before.webp", "after.webp", 900, 1200)

# ── תקציבי משקל ──────────────────────────────────────────────────────
# האתר מתמחר תמונות בקילובייטים ולא בדרגת איכות — בדיוק כמו
# מסלול-צילום/build-heroes.py. הסיבה: אותה דרגת איכות מייצרת 200KB
# מצילום נקי ו-700KB מקיר עלווה צפוף, ודווקא צילומי הגינות הם עלווה.
# איכות קבועה q82 הפיקה כאן קובץ גלריה של 690KB.
# הירו הוא אלמנט ה-LCP של עמוד הפרויקט ולכן התקציב שלו הדוק ביותר;
# הגלריה יושבת מתחת לקיפול ונטענת בעצלתיים, ולכן מותר לה יותר.
#
# המספרים כוילו מול מה שהיה באתר עד 30.8.2026: הירו בחציון 425KB
# ובמקסימום 927KB, גלריה בחציון 276KB. כלומר כל שורה כאן היא הידוק
# מול המצב הקודם, אבל לא כזה שמכריח את הדחיסה לרדת לרצפה.
BUDGET = {
    "hero.webp": 280_000,
    "hero-mobile.webp": 230_000,
    "thumb.webp": 220_000,
    "gallery": 400_000,
    "before.webp": 220_000,
    "after.webp": 220_000,
}
# ⚠️ הרצפה היא 58 ולא 45. מתחת ל-58 עלווה צפופה — שהיא רוב מה שמצולם
# פה — מתפרקת לכתמים, ותמונה מכוערת גרועה יותר מתמונה כבדה. קובץ
# שלא נכנס לתקציב גם ברצפה נשמר ברצפה ומדווח כחריגה, במקום להימחץ
# בשקט ל-q45.
QUALITY_MAX, QUALITY_MIN = 84, 58
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff")

FOLDERS = ("הירו", "שער", "גלריה", "לפני-אחרי", "ארכיון")
FOCUS = {"#למעלה": 0.0, "#למטה": 1.0, "#מרכז": 0.5}


def norm(s):
    """macOS כותב עברית ב-NFD. בלי הנרמול, השוואת מחרוזות נכשלת בשקט."""
    return unicodedata.normalize("NFC", s)


def open_image(path):
    """פותח תמונה ומיישר לפי EXIF.

    ⚠️ exif_transpose חובה: בלי זה כל צילום אנכי מאייפון נפתח שכוב על
    הצד, והחיתוך מתבצע על התמונה השגויה. אותה מלכודת שכבר תועדה
    בזיכרון site-image-processing-exif.
    """
    try:
        im = Image.open(path)
        im.load()
    except Exception:
        # HEIC מהאייפון: Pillow לא קורא בלי pillow-heif, אבל sips של
        # macOS כן. ממירים ל-JPEG זמני ומנסים שוב.
        if not path.lower().endswith((".heic", ".heif")):
            raise
        tmp = os.path.join(ROOT, "_heic.tmp.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", path, "--out", tmp],
                       check=True, capture_output=True)
        im = Image.open(tmp)
        im.load()
        os.remove(tmp)
    return ImageOps.exif_transpose(im).convert("RGB")


def parse_name(fn):
    """שם קובץ -> (מספר סדר, כיתוב, מיקוד).  '03 פינת ישיבה #למטה.jpg'"""
    stem = norm(os.path.splitext(fn)[0])
    focus = 0.5
    for token, value in FOCUS.items():
        if token in stem:
            focus = value
            stem = stem.replace(token, "")
    m = re.match(r"^\s*(\d+)\s*[.\-–—_)]*\s*(.*)$", stem)
    order, text = (int(m.group(1)), m.group(2)) if m else (10**6, stem)
    return order, " ".join(text.split()), focus


def listdir(path):
    if not os.path.isdir(path):
        return []
    out = [f for f in os.listdir(path)
           if not f.startswith(".") and f.lower().endswith(EXTS)]
    return sorted(out, key=lambda f: (parse_name(f)[0], norm(f)))


def crop_to(im, tw, th, focus=0.5):
    """חיתוך ליחס היעד ואז הקטנה. focus=0 עליון, 1 תחתון, 0.5 מרכז."""
    target = tw / th
    w, h = im.size
    if w / h > target:                      # רחב מדי -> חותכים בצדדים
        nw = round(h * target)
        left = (w - nw) // 2                # אופקית תמיד מהמרכז
        im = im.crop((left, 0, left + nw, h))
    else:                                   # גבוה מדי -> חותכים בגובה
        nh = round(w / target)
        top = round((h - nh) * focus)
        im = im.crop((0, top, w, top + nh))
    return im.resize((tw, th), Image.LANCZOS)


def save(im, path, write, budget):
    """שומר WebP ומוריד איכות עד שהקובץ נכנס לתקציב.

    מחזיר (בייטים, איכות). בריצה יבשה מקודד לזיכרון בלבד, כדי שהדוח
    יראה משקל אמיתי לפני שנוגעים בדיסק.
    """
    # חיפוש בינארי, ולא סריקה יורדת: הדרגה נמצאת ב-5 קידודים במקום עד 13.
    # ⚠️ הסריקה מקודדת ב-method=0 (המהיר) ורק השמירה ב-method=6 (הקטן).
    # ‏method=6 תמיד מפיק קובץ קטן יותר מ-method=0 באותה דרגה, ולכן
    # אומדן על 0 הוא שמרני — התוצאה הסופית לא תחרוג מהתקציב.
    # בלי זה ההרצה על 12 פרויקטים ארכה עשרות דקות, וזה סקריפט שירין
    # מריץ בכל פעם שהוא מזיז תמונה.
    def probe(q):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=0)
        return buf.tell()

    lo, hi, qual = QUALITY_MIN, QUALITY_MAX, QUALITY_MIN
    if probe(QUALITY_MAX) <= budget:
        qual = QUALITY_MAX
    else:
        while lo <= hi:
            mid = (lo + hi) // 2
            if probe(mid) <= budget:
                qual, lo = mid, mid + 1
            else:
                hi = mid - 1
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=qual, method=6)
    data = buf.getvalue()
    if write:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    return len(data), qual, len(data) > budget


def project_dirs():
    """תיקיות המקור -> (slug, שם לתצוגה, נתיב). שם התיקייה נושא את ה-slug."""
    if not os.path.isdir(SRC):
        sys.exit(f"תיקיית המקור לא קיימת: {SRC}\nהרץ תחילה: python3 build_site_images.py --init")
    out = []
    for d in sorted(os.listdir(SRC)):
        p = os.path.join(SRC, d)
        if not os.path.isdir(p) or d.startswith((".", "_")):
            continue
        slug = norm(d).split("—")[0].split(" - ")[0].strip()
        out.append((slug, norm(d), p))
    return out


def build(write, only=None):
    problems, report = [], []
    for slug, label, path in project_dirs():
        if only and slug != only:
            continue
        hero = listdir(os.path.join(path, "הירו"))
        cover = listdir(os.path.join(path, "שער"))
        gallery = listdir(os.path.join(path, "גלריה"))
        dest = os.path.join(OUT, slug)
        line = [f"\n■ {label}"]

        if not hero:
            problems.append(f"{label}: תיקיית 'הירו' ריקה — לא נוצר הירו ולא שער")
            line.append("   ✖ אין הירו")
            report.append("\n".join(line))
            continue
        if len(hero) > 1:
            problems.append(f"{label}: {len(hero)} תמונות ב'הירו' — נלקחה {hero[0]}")

        hero_src = os.path.join(path, "הירו", hero[0])
        _, hero_alt, hero_focus = parse_name(hero[0])
        if not hero_alt:
            problems.append(f"{label}: לתמונת ההירו אין כיתוב בשם הקובץ")
        him = open_image(hero_src)
        hero_landscape = him.width > him.height
        hero_layout = "band" if hero_landscape else "split"
        line.append(f"   הירו   {hero[0]}  ({him.width}×{him.height}, "
                    f"{'לרוחב' if hero_landscape else 'לאורך'} → {hero_layout})")

        if hero_landscape:
            hw, hh = HERO_BAND[1], HERO_BAND[2]
            hero_img = crop_to(him, hw, hh, hero_focus)
        else:
            # ביחס של הצילום עצמו, חסום — אפס חיתוך ברוב המקרים
            r = min(max(him.width / him.height, HERO_SPLIT_RATIO[0]), HERO_SPLIT_RATIO[1])
            hw = HERO_SPLIT_WIDTH
            hh = round(hw / r)
            hero_img = crop_to(him, hw, hh, hero_focus)
        n, q, over = save(hero_img, os.path.join(dest, HERO_BAND[0]), write, BUDGET[HERO_BAND[0]])
        if over:
            problems.append(f"{label}: hero.webp יצא {n//1024}KB — מעל התקציב גם באיכות המינימלית")
        line.append(f"     → {HERO_BAND[0]:18} {hw}×{hh}  {n/1024:5.0f} KB  q{q}")

        name, w, h = HERO_MOBILE
        n, q, over = save(crop_to(him, w, h, hero_focus), os.path.join(dest, name), write, BUDGET[name])
        if over:
            problems.append(f"{label}: {name} יצא {n//1024}KB — מעל התקציב גם באיכות המינימלית")
        line.append(f"     → {name:18} {w}×{h}  {n/1024:5.0f} KB  q{q}")

        # השער: תיקיית 'שער' גוברת; אחרת נגזר מתמונת ההירו
        if cover:
            cim = open_image(os.path.join(path, "שער", cover[0]))
            _, cover_alt, cover_focus = parse_name(cover[0])
            src_label = cover[0]
        else:
            cim, cover_alt, cover_focus, src_label = him, hero_alt, hero_focus, "(מההירו)"
        cover_landscape = cim.width > cim.height
        tname, tw, th = THUMB_LANDSCAPE if cover_landscape else THUMB_PORTRAIT
        n, q, over = save(crop_to(cim, tw, th, cover_focus),
                          os.path.join(dest, tname), write, BUDGET[tname])
        if over:
            problems.append(f"{label}: thumb.webp יצא {n//1024}KB — מעל התקציב גם באיכות המינימלית")
        line.append(f"   שער    {src_label}  ({'לרוחב → כרטיס רחב' if cover_landscape else 'לאורך → כרטיס 3:4'})")
        line.append(f"     → {tname:18} {tw}×{th}  {n/1024:5.0f} KB  q{q}")

        # ── לפני / אחרי ──
        ba = listdir(os.path.join(path, "לפני-אחרי"))
        before = [f for f in ba if norm(f).startswith("לפני")]
        after = [f for f in ba if norm(f).startswith("אחרי")]
        ba_alts = None
        if before or after:
            if not (before and after):
                problems.append(f"{label}: תיקיית 'לפני-אחרי' צריכה קובץ אחד שמתחיל ב'לפני' ואחד ב'אחרי'")
            else:
                ba_alts = {}
                for fn, out_name, key in ((before[0], BA[0], "before"), (after[0], BA[1], "after")):
                    bim = open_image(os.path.join(path, "לפני-אחרי", fn))
                    _, alt, focus = parse_name(fn)
                    alt = re.sub(r"^(לפני|אחרי)\s*", "", alt)
                    n, q, _ = save(crop_to(bim, BA[2], BA[3], focus),
                                   os.path.join(dest, out_name), write, BUDGET[out_name])
                    ba_alts[key] = alt
                    line.append(f"   {fn[:4]}   {fn}")
                    line.append(f"     → {out_name:18} {BA[2]}×{BA[3]}  {n/1024:5.0f} KB  q{q}")

        alts = []
        line.append(f"   גלריה  {len(gallery)} תמונות")
        for i, fn in enumerate(gallery, 1):
            gim = open_image(os.path.join(path, "גלריה", fn))
            _, alt, _ = parse_name(fn)
            if not alt:
                problems.append(f"{label}: אין כיתוב לקובץ {fn}")
            gw = min(GALLERY_WIDTH, gim.width)
            gh = round(gim.height * gw / gim.width)
            if gw / gh < 0.5:
                problems.append(f"{label}: {fn} צר מאוד ({gw/gh:.2f}) — ישבור את הטור בגלריה")
            out_name = f"g{i}.webp"
            n, q, over = save(gim.resize((gw, gh), Image.LANCZOS),
                              os.path.join(dest, out_name), write, BUDGET["gallery"])
            if over:
                problems.append(f"{label}: {fn} יצא {n//1024}KB — מעל התקציב גם באיכות המינימלית")
            alts.append({"file": out_name, "alt": alt, "w": gw, "h": gh})
            line.append(f"     → {out_name:5} {gw}×{gh:<5} {n/1024:4.0f} KB q{q:<2} {alt or '⚠ ללא כיתוב'}")

        if write:
            # נשארו קבצי g*.webp מהרצה קודמת עם יותר תמונות? מסירים,
            # אחרת הגלריה תגיש תמונה שירין הוציא מהתיקייה.
            for f in os.listdir(dest) if os.path.isdir(dest) else []:
                m = re.fullmatch(r"g(\d+)\.webp", f)
                if m and int(m.group(1)) > len(gallery):
                    os.remove(os.path.join(dest, f))
                    line.append(f"     ✂ הוסר {f} (כבר לא בתיקיית המקור)")
            json.dump({"hero_alt": hero_alt, "cover_alt": cover_alt,
                       "hero_layout": hero_layout, "hero_w": hw, "hero_h": hh,
                       "cover_wide": cover_landscape,
                       "gallery": alts, "ba": ba_alts},
                      open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
        report.append("\n".join(line))

    problems += check_index()
    print("\n".join(report))
    print("\n" + "═" * 60)
    if problems:
        print(f"⚠ {len(problems)} דברים לתשומת לבך:")
        for p in problems:
            print(f"   • {p}")
    else:
        print("✓ אין בעיות")
    if not write:
        print("\n(ריצה יבשה. להרצה בפועל: --write)")


# ── כללי התקינות של עמוד פרויקט ───────────────────────────────────────
# נקבעו על ידי ירין 30.8.2026. הבדיקה יושבת בסקריפט ולא בראש של מישהו,
# כי היא צריכה לרוץ בכל פעם שמזיזים תמונה.
GALLERY_MIN, GALLERY_MAX = 4, 10


def check_project(slug, label, path):
    """מחזיר (ליקויים, הערות).

    ליקוי חוסם — משהו שבור או מחוץ לכללים. הערה לא חוסמת: היא מתעדת
    מגבלה של חומר הגלם שאין לה תיקון בקוד, כמו צילום ברזולוציה נמוכה.
    ⚠️ בדיקה שנכשלת תמיד היא בדיקה שמפסיקים להסתכל בה, ולכן ההפרדה.
    """
    bad, notes = [], []
    hero = listdir(os.path.join(path, "הירו"))
    gallery = listdir(os.path.join(path, "גלריה"))

    if not hero:
        bad.append("אין תמונת הירו")
    else:
        him = open_image(os.path.join(path, "הירו", hero[0]))
        if him.width <= him.height:
            # לאורך מותר, אבל רק אם אין בתיקייה צילום לרוחב *שמיש*.
            # ⚠️ "שמיש" = רוחב 1400 ומעלה. ההירו לדסקטופ הוא 1600×695,
            # וצילום לרוחב ברוחב 1024 היה נמתח כלפי מעלה ויוצא רך —
            # כלומר הכלל "לרוחב עדיף" היה מחליף תמונה טובה בתמונה
            # מטושטשת. זה בדיוק המקרה של bny-offices.
            pool, too_small = [], 0
            for sub in ("הירו", "שער", "גלריה", "ארכיון"):
                for f in listdir(os.path.join(path, sub)):
                    try:
                        with Image.open(os.path.join(path, sub, f)) as im:
                            w, h = ImageOps.exif_transpose(im).size
                    except Exception:
                        continue
                    if w > h:
                        (pool if w >= 1400 else []).append(f"{sub}/{f}")
                        too_small += w < 1400
            if pool:
                bad.append(f"ההירו לאורך ({him.width/him.height:.2f}) "
                           f"אבל יש {len(pool)} צילומים לרוחב בתיקייה — "
                           f"למשל {pool[0]}")
            elif too_small:
                notes.append(f"הירו לאורך כי {too_small} הצילומים לרוחב "
                             f"בתיקייה צרים מ-1400px ולא מספיקים לרצועה")

    if not GALLERY_MIN <= len(gallery) <= GALLERY_MAX:
        bad.append(f"{len(gallery)} תמונות בגלריה — צריך {GALLERY_MIN}-{GALLERY_MAX}")

    for f in gallery:
        try:
            with Image.open(os.path.join(path, "גלריה", f)) as im:
                w, h = ImageOps.exif_transpose(im).size
        except Exception as e:
            bad.append(f"{f}: לא ניתן לקרוא ({e})")
            continue
        # הרוחב הוא מה שקובע: תמונת גלריה יושבת בטור של 373px, כלומר
        # 746px במסך רטינה. מתחת ל-900 היא כבר רכה בטלפון בטור אחד.
        if w < 900:
            notes.append(f"{f}: {w}×{h} — רזולוציה נמוכה, תיראה רכה בטלפון")
        if w / h < 0.5 or w / h > 2.2:
            bad.append(f"{f}: יחס {w/h:.2f} קיצוני — ישבור את הטור בגלריה")
    return bad, notes


def check_all():
    print(f'{"פרויקט":24} {"הירו":>14} {"גלריה":>7}  מצב')
    print("─" * 78)
    ok = 0
    all_notes = []
    for slug, label, path in project_dirs():
        bad, notes = check_project(slug, label, path)
        all_notes += [f"{slug}: {n}" for n in notes]
        hero = listdir(os.path.join(path, "הירו"))
        ho = "—"
        if hero:
            him = open_image(os.path.join(path, "הירו", hero[0]))
            ho = f'{"לרוחב" if him.width > him.height else "לאורך"} {him.width/him.height:.2f}'
        n = len(listdir(os.path.join(path, "גלריה")))
        print(f'{slug:24} {ho:>14} {n:>7}  {"✓ תקין" if not bad else "✖"}')
        for b in bad:
            print(f'{"":24} {"":14} {"":7}    ✖ {b}')
        ok += not bad
    print("─" * 78)
    print(f'{ok} מתוך {len(project_dirs())} פרויקטים תקינים')
    if all_notes:
        print(f'\nהערות ({len(all_notes)}) — מגבלות של חומר הגלם, לא ליקויים:')
        for n in all_notes:
            print(f'   · {n}')
    return ok == len(project_dirs())


def check_index():
    """מוודא ש-index.html מסונכרן עם תמונות השער.

    ⚠️ הכרטיסים בעמוד הבית נכתבו ביד ואינם נוצרים מ-build_projects.py,
    אבל הם מצביעים על אותם קובצי thumb.webp. כשהיחס של שער משתנה
    (לאורך ↔ לרוחב) העמוד לא יודע על כך: המחלקה נשארת שגויה והממדים
    שמורים ל-CLS מצביעים על גודל שכבר לא קיים. זה בדיוק הכיוון ההפוך
    של המלכודת המוכרת — שם סקריפט דרס תיקון ידני, כאן תיקון ידני
    מפגר אחרי הסקריפט — ולכן הבדיקה יושבת כאן ולא בזיכרון של מישהו.
    """
    path = os.path.join(ROOT, "index.html")
    if not os.path.exists(path):
        return []
    html = open(path, encoding="utf-8").read()
    out = []
    for part in re.split(r'(?=<div\s*\n?\s*class="pj-card)', html)[1:]:
        m = re.search(r'data-href="project-([a-z-]+)\.html"', part)
        if not m:
            continue
        slug = m.group(1)
        mfp = os.path.join(OUT, slug, "manifest.json")
        thumb = os.path.join(OUT, slug, "thumb.webp")
        if not (os.path.exists(mfp) and os.path.exists(thumb)):
            continue
        wide = json.load(open(mfp, encoding="utf-8"))["cover_wide"]
        with Image.open(thumb) as im:
            w, h = im.size
        cls = re.search(r'class="(pj-card[^"]*)"', part)
        dim = re.search(r'width="(\d+)"\s*\n?\s*height="(\d+)"', part)
        if cls and ("wide" in cls.group(1)) != wide:
            out.append(f'index.html — {slug}: הכרטיס {"חסר" if wide else "נושא"} את המחלקה wide')
        if dim and (int(dim.group(1)), int(dim.group(2))) != (w, h):
            out.append(f'index.html — {slug}: ממדים {dim.group(1)}×{dim.group(2)} '
                       f'אבל הקובץ {w}×{h}')
    return out


def sync_index():
    """מיישר את כרטיסי עמוד הבית לתמונות שנוצרו.

    ⚠️ הכרטיסים ב-index.html נכתבים ביד, ולכן כל היפוך יחס של שער
    משאיר אותם עם מחלקה שגויה ועם ממדים של קובץ שכבר לא קיים. עד
    30.8.2026 זה תוקן ידנית פעמיים באותו יום. עכשיו זו פקודה.
    """
    path = os.path.join(ROOT, "index.html")
    html = open(path, encoding="utf-8").read()
    parts = re.split(r'(?=<div\s*\n?\s*class="pj-card)', html)
    out, n = [parts[0]], 0
    for part in parts[1:]:
        m = re.search(r'data-href="project-([a-z-]+)\.html"', part)
        if m:
            slug = m.group(1)
            mfp = os.path.join(OUT, slug, "manifest.json")
            thumb = os.path.join(OUT, slug, "thumb.webp")
            if os.path.exists(mfp) and os.path.exists(thumb):
                wide = json.load(open(mfp, encoding="utf-8"))["cover_wide"]
                with Image.open(thumb) as im:
                    w, h = im.size
                before = part
                part = re.sub(r'class="pj-card[^"]*"',
                              f'class="pj-card{" wide" if wide else ""}"', part, count=1)
                part = re.sub(r'width="\d+"(\s*\n?\s*)height="\d+"',
                              f'width="{w}"\\g<1>height="{h}"', part, count=1)
                n += part != before
        out.append(part)
    open(path, "w", encoding="utf-8").write("".join(out))
    print(f"✓ {n} כרטיסים בעמוד הבית סונכרנו")


def init():
    """יוצר את שלד התיקיות לכל פרויקט שקיים באתר, בלי לדרוס דבר."""
    import build_projects
    made = 0
    for p in build_projects.PROJECTS:
        d = os.path.join(SRC, f"{p['slug']} — {p['title']}")
        for sub in FOLDERS:
            path = os.path.join(d, sub)
            if not os.path.isdir(path):
                os.makedirs(path)
                made += 1
        print(f"  ✓ {os.path.basename(d)}")
    print(f"\nנוצרו {made} תיקיות תחת {SRC}")


if __name__ == "__main__":
    if "--init" in sys.argv:
        init()
    elif "--sync-index" in sys.argv:
        sync_index()
    elif "--check" in sys.argv:
        sys.exit(0 if check_all() else 1)
    else:
        only = None
        if "--only" in sys.argv:
            only = sys.argv[sys.argv.index("--only") + 1]
        build("--write" in sys.argv, only)
