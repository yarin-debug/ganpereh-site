#!/usr/bin/env python3
"""build_projects.py — מייצר את גלריית הפרויקטים: projects.html + עמוד לכל פרויקט.

מקור האמת לתוכן הפרויקטים הוא מבנה PROJECTS כאן. להוספת פרויקט:
מוסיפים רשומה, מעבדים תמונות ל-images/projects/<slug>/ ומריצים:
  python3 build_projects.py

הניווט והפוטר נקראים מ-partials/ (כמו build.py) — אין לערוך אותם בעמודים ידנית.
"""
import os, urllib.parse

# ⚠️ מזהה פיקסל מטא: הוחלף ידנית ב-37 עמודים ב-17.8.2026 (הישן,
# GreenSpace, לא היה מחובר לחשבון המודעות ולכן כל התנועה הייתה
# בלתי-נראית למטא) — אבל הסקריפט הזה, מקור האמת ל-13 עמודי
# הפרויקטים, נשאר עם הישן, וכל בנייה מחדש החזירה אותם לפיקסל
# המת. אם מחליפים פיקסל — להחליף גם כאן.
ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://ganpereh.co.il"

def dims(rel_path):
    """width/height אמיתיים מהקובץ, כטקסט מוכן להזרקה לתגית.
    בלי הממדים הדפדפן לא יודע כמה מקום לשריין, וכל תמונה שנטענת
    דוחפת את מה שמתחתיה — CLS בכל טעינה של כל אחד מ-12 העמודים.
    קובץ חסר לא מפיל את הבנייה, פשוט יוצא בלי ממדים."""
    try:
        from PIL import Image

        with Image.open(os.path.join(ROOT, rel_path)) as im:
            return f' width="{im.width}" height="{im.height}"'
    except Exception:
        return ""


CATS = {
    "houses": "בתים פרטיים",
    "buildings": "בנייני מגורים",
    "roof": "מרפסות וגגות",
    "offices": "משרדים",
    "commercial": "מסחר וקפה",
}

# span2 = כרטיס רחב בגריד הארכיון (hero לרוחב)
PROJECTS = [
    {
        "slug": "graytzer",
        "title": "גן גג לפנטהאוז",
        "seo_title": "גן גג לפנטהאוז בצפון תל אביב | פרויקט של גן פרא",
        "meta": "פנטהאוז · צפון תל אביב",
        "cat": "roof",
        "span2": True,
        "short": "גג שהפך לחדר נוסף של הבית: ספות בנויות סביב קערת אש, עץ זית באדנית פלדה ופריחה עונתית מול קו הרקיע.",
        "story": [
            ("הפרויקט", "מרפסת גג של פנטהאוז עם נוף פתוח לעיר. התכנון חילק את הגג לאזור ישיבה מרכזי, בר ומקלחת חוץ, כך שהגג מתפקד כחלל מגורים לכל דבר."),
            ("מה הקמנו", "ריצוף דמוי עץ, ספות ישיבה בנויות עם כריות בגוני חול וקערת אש עגולה מבטון במרכז. לאורך המעקות אדניות פלדה בגובה ישיבה."),
            ("הצמחייה", "עץ זית בוגר כעוגן, וסביבו סוקולנטים, דגניים ופריחה שמתחלפת לאורך השנה. הכול נבחר לעמידות בשמש מלאה וברוח של גג."),
        ],
        "facts": ["גן גג", "ישיבה בנויה וקערת אש", "עץ זית בוגר", "פריחה עונתית"],
        "hero_alt": "גן גג של פנטהאוז: ספות בנויות, קערת אש מבטון ואדניות פורחות מול קו הרקיע",
        "gallery_alts": [
            "מבט רחב על הגג: ספות בנויות, עץ זית ובוגנוויליה מול השמיים",
            "פינת ישיבה עם עץ זית וקו הרקיע של העיר",
            "ספה וקערת אש עם רקפות באור חם",
            "קערת האש מזווית נמוכה עם רקפות פורחות",
            "ספה עטופה בצמחייה פורחת מול נוף העיר",
            "ישיבה לאורך אדנית סוקולנטים",
            "גזע עץ הזית ופריחת סטטיס סגולה למרגלותיו",
        ],
    },
    {
        "slug": "mirpeset-hamishtala",
        "title": "מרפסת בשכונת המשתלה",
        "seo_title": "עיצוב מרפסת בשכונת המשתלה, תל אביב | גן פרא",
        "meta": "מרפסת · תל אביב",
        "cat": "roof",
        "span2": False,
        "short": "דק, פרגולה ואדניות לאורך כל המעקה. קיר יסמין, דגניים והיביסקוס שממסגרים את הנוף הפתוח.",
        "story": [
            ("הפרויקט", "מרפסת היקפית עם נוף עירוני פתוח. הירוק עוטף את המעקה בלי לחסום את הנוף, עם פינות ישיבה מוצלות."),
            ("מה הקמנו", "דק עץ, פרגולה עם הצללה ואדניות בנויות לאורך המעקה. עציצי חרס בטורקיז ובצהוב מוסיפים צבע בין הירוק."),
            ("הצמחייה", "יסמין מטפס שנבנה כקיר ירוק, דגניים שזזים ברוח, היביסקוס, רקפות עונתיות ועץ הדר בכלי. שתילה שמחזיקה חשיפה מלאה לשמש ולרוח."),
        ],
        "facts": ["מרפסת היקפית", "דק ופרגולה", "קיר יסמין", "פריחה כל השנה"],
        "hero_alt": "מרפסת עם דק, פרגולה ואדניות בשעת שקיעה",
        "gallery_alts": [
            "פרספקטיבת הדק לאורך המרפסת עם אדניות משני הצדדים",
            "קו המעקה: דגניים ושתילה מעורבת מול שמיים פתוחים",
            "רקפות אדומות, כלים צהובים וקיר יסמין",
            "קיר ירוק של יסמין באדנית לבנה",
            "תקריב פרח היביסקוס",
            "מבט לאורך הדק עם פריחה צהובה וסגולה",
        ],
    },
    {
        "slug": "king-george",
        "title": "בניין בוטיק בקינג ג'ורג'",
        "seo_title": "גינת בניין בוטיק בקינג ג'ורג', תל אביב | גן פרא",
        "meta": "בניין בוטיק · תל אביב",
        "cat": "buildings",
        "span2": False,
        "short": "אדניות דגניים לאורך מעקות הגג, חצר דירת גן מרוצפת אבן ועצי פרי בכלים, מול קו הרקיע של תל אביב.",
        "story": [
            ("הפרויקט", "פרויקט גינון שלם לבניין בוטיק: מסדרונות גג, מרפסות וחצר דירת גן. שפה ירוקה אחת לכל הבניין."),
            ("מה הקמנו", "אדניות לאורך המעקות, דק, אדניות בטון מדורגות וחצר מרוצפת אבן עם אדניות בנויות."),
            ("הצמחייה", "דגניים כחוט מקשר בין הקומות, במבוק בחצר המוצלת, סוקולנטים, עצי פרי בכלים ושתילה עונתית באדניות המדורגות."),
        ],
        "facts": ["גגות ומרפסות", "חצר דירת גן", "אדניות דגניים", "נוף עירוני"],
        "hero_alt": "פינת מרפסת עם עץ פרי, כורסאות ראטן ומגדלי העיר ברקע",
        "gallery_alts": [
            "חצר פנימית מוצלת עם דק, במבוק ודגניים",
            "פטיו דירת גן: ריצוף אבן ואדניות לבנות",
            "מסדרון גג עם אדנית דגניים לאורך המעקה וקו הרקיע של תל אביב",
            "דק גג עם רצועת דגניים ונוף גגות",
            "אדניות בטון מדורגות עם שתילה עונתית",
            "עלווה צבעונית: קרוטון ואגבה על רקע חיפוי עץ",
        ],
    },
    {
        "slug": "yuval",
        "title": "חצר בית פרטי",
        "seo_title": "עיצוב חצר לבית פרטי ברמת אביב | גן פרא",
        "meta": "בית פרטי · רמת אביב",
        "cat": "houses",
        "span2": True,
        "short": "פרגולת ברזל שחורה עם מטפסים מעל פינת אוכל ארוכה, אבני ענק, בריקים בדוגמת אדרה וירוק רב-שכבתי.",
        "story": [
            ("הפרויקט", "חצר של בית פרטי שתוכננה להרגיש כמו גינה ותיקה שתמיד הייתה שם: שבילים, פינות ישיבה וצמחייה שנבנתה בשכבות."),
            ("מה הקמנו", "ריצוף בריקים בדוגמת אדרה משולב באבני ענק טבעיות, פרגולת ברזל שחורה מעל פינת האוכל, פינת לאונג', פנסי ברזל וכדים שחורים."),
            ("הצמחייה", "עצי פרי וזית בוגרים, מטפסים על הפרגולה ודשאי נוי גבוהים. צפיפות מכוונת שנותנת תחושה של ג'ונגל מתורבת."),
        ],
        "facts": ["פרגולת ברזל", "אבני ענק ובריקים", "עצים בוגרים", "תאורת גן"],
        "hero_alt": "פינת אוכל תחת פרגולת ברזל שחורה עם מטפסים ושביל אבני ענק",
        "gallery_alts": [
            "פינת האוכל דרך קשתות הפרגולה, מוקפת ירוק",
            "שביל בריקים עם עץ בוגר ודשאי נוי",
            "פינת לאונג' לבנה על אבני ענק",
            "מבט דרך קשת הפרגולה אל פינת האוכל",
            "פנסי ברזל בין דשאי נוי",
            "שביל אבן מתפתל בין הערוגות",
        ],
    },
    {
        "slug": "weizmann",
        "title": "גינה משותפת בויצמן 97",
        "seo_title": "גינה משותפת לבניין מגורים בצפון תל אביב | גן פרא",
        "meta": "בניין מגורים · צפון תל אביב",
        "cat": "buildings",
        "span2": True,
        "short": "חצר פנימית בין בניינים שהפכה לפינה טרופית: דקלי אריקה, סטרליציה ואלוקסיה סביב מרחב דשא.",
        "story": [
            ("הפרויקט", "חצר פנימית מוקפת קירות לבנים. הקו: מינימליזם טרופי, גבולות שתילה צפופים סביב מרחב דשא פתוח."),
            ("מה הקמנו", "מרחב דשא מרכזי, ערוגות היקפיות עם השקיה אוטומטית ומעבר צדדי ירוק בין הקירות."),
            ("לפני ואחרי", "יש כאן גם תיעוד משלב השתילה: טפטפות גלויות ושתילים קטנים, מול המצב הבשל של היום."),
        ],
        "facts": ["חצר פנימית", "צמחייה טרופית", "השקיה אוטומטית", "לפני ואחרי"],
        "hero_alt": "פינה טרופית צפופה: דקלי אריקה, סטרליציה ופילודנדרון על רקע קיר לבן",
        "gallery_alts": [
            "מרחב הדשא עם גבול שתילה ירוק ארוך",
            "טריז הדשא במרכז עם ערוגות משני הצדדים",
            "הגבול הצפוף: דקלים ופילודנדרון מעל הדשא",
            "פינת הדשא באור מלא עם צמחייה טרופית",
            "דקלי אריקה רוכנים מעל הדשא",
            "מעבר צדדי צר עם דקלים ואלוקסיה",
        ],
        "before_alt": "הערוגות מיד אחרי השתילה: שלוחות טפטוף ושתילים צעירים",
        "before_caption_before": "אחרי השתילה",
        "before_caption_after": "היום",
    },
    {
        "slug": "ben-shprut",
        "title": "גינת בניין בבן שפרוט",
        "seo_title": "גינת בניין מגורים בכיכר המדינה, תל אביב | גן פרא",
        "meta": "בניין מגורים · כיכר המדינה",
        "cat": "buildings",
        "span2": False,
        "short": "ערוגות היקפיות על טוף אדום סביב בניין חדש: דשאי נוי, קורדיליינים אדומים ועצים צעירים בגזעים מולבנים.",
        "story": [
            ("הפרויקט", "פיתוח שטחי החוץ של בניין מגורים חדש, מהחזית ועד קומת העמודים. גינון שנראה טוב מהרחוב וגם מקרוב, בדרך הביתה."),
            ("מה הקמנו", "ערוגות היקפיות על מצע טוף אדום, לאורך החזית והמדרכה ובתוך קומת העמודים."),
            ("הצמחייה", "שתילה בשכבות: דשאי נוי גבוהים, סנסווריה, קורדיליינים אדומים ועצים צעירים בגזעים מולבנים. הצבע מגיע מהעלווה, ולכן נשמר כל השנה."),
        ],
        "facts": ["שטח משותף", "ערוגות טוף", "עלווה צבעונית", "עצים צעירים"],
        "hero_alt": "ערוגות משוכבות מתחת לקומת עמודים: דשאי נוי, סנסווריה ועצים צעירים",
        "gallery_alts": [
            "פרספקטיבה לאורך חזית הבניין עם עצים בגזעים מולבנים",
            "קורדיליינים אדומים סביב עמוד הבניין",
            "ערוגת קורדיליינים על טוף אדום מול חזית לבנה",
            "ערוגה לאורך הפסאדה עם דשאי נוי",
            "דשאים גבוהים מול קווי הבניין",
            "מרקם הערוגה הצפוף ממבט על",
        ],
    },
    {
        "slug": "moshav-hatzav",
        "title": "חצר במושב חצב",
        "seo_title": "עיצוב חצר לבית פרטי במושב חצב | גן פרא",
        "meta": "בית פרטי · מושב",
        "cat": "houses",
        "span2": True,
        "short": "מדשאה רחבה, שביל אבני מדרך, פרגולת במבוק ואח חוץ. גינה שחיה מהבוקר עד הלילה.",
        "story": [
            ("הפרויקט", "חצר מושב גדולה ופתוחה. התכנון שמר על תחושת המרחב: מדשאה נרחבת, שביל שחוצה אותה וערוגות פריחה לאורך הגדר."),
            ("מה הקמנו", "שביל אבני מדרך, ערוגות היקפיות, פרגולת במבוק עם פינת ישיבה, שרשראות תאורה ואח חוץ."),
            ("הצמחייה", "עץ מנגו מניב, עצים צעירים שיגדלו לצל, גדר חיה פורחת ופריחה עונתית לאורך החומה."),
        ],
        "facts": ["מדשאה נרחבת", "אח חוץ", "פרגולת במבוק", "עצי פרי"],
        "hero_alt": "מבט מתחת לפרגולת במבוק אל מדשאה, שביל אבני מדרך וגדר חיה פורחת",
        "gallery_alts": [
            "מדשאה רחבה בשעת בין ערביים עם ערוגות פריחה",
            "שוט לילה: שרשרת תאורה, אח חוץ בוער וספת גן",
            "ענפי מנגו עם פרי על רקע שקיעה",
            "פרי מנגו מול הדשא ואבני המדרך",
        ],
    },
    {
        "slug": "ramat-hahayal",
        "title": "בית קרקע ברמת החייל",
        "seo_title": "גינה לבית קרקע ברמת החייל, תל אביב | גן פרא",
        "meta": "בית קרקע · תל אביב",
        "cat": "houses",
        "span2": False,
        "short": "עץ המנגו הוותיק נשאר במרכז. סביבו מדשאה חדשה מקיר לקיר שהחזירה את החצר הביתה.",
        "story": [
            ("הפרויקט", "חצר עם עץ מנגו בוגר שקבע את כל התכנון. במקום לעקור ולהתחיל מאפס, הגינה נבנתה סביבו."),
            ("מה הקמנו", "הכשרת קרקע מלאה, מדשאה מקיר לקיר ומעבר צדדי מטויח עם כלי בטון ופלומריה."),
            ("לפני ואחרי", "התיעוד כאן מתחיל באדמה חשופה ומסתיים בדשא. אותה זווית, אותה חצר."),
        ],
        "facts": ["שימור עץ בוגר", "מדשאה", "הכשרת קרקע", "לפני ואחרי"],
        "hero_alt": "מעבר צדדי מטויח עם כלי בטון ופלומריה",
        "gallery_alts": [],
        "before_alt": "החצר לפני: אדמה חשופה מיושרת סביב העץ",
        "before_caption_before": "לפני",
        "before_caption_after": "אחרי",
        "after_img": "g1.webp",
    },
    {
        "slug": "bny-offices",
        "title": "משרדי BNY",
        "seo_title": "גינון למשרדים — משרדי BNY, פנים וגג | גן פרא",
        "meta": "משרדים · פנים וגג",
        "cat": "offices",
        "span2": True,
        "short": "בריכת השתקפות, דקלים באדניות בטון ופינות ישיבה על גג המשרדים. בפנים: מחיצות צמחייה וכדים שחורים.",
        "story": [
            ("הפרויקט", "הצמחה מלאה של משרדי חברה: חלל פנים תעשייתי-מודרני ומרפסת גג. הצמחייה מרככת את הבטון, הזכוכית והברזל."),
            ("מה הקמנו", "על הגג: דקלי אריקה באדניות בטון סביב בריכת השתקפות ופינות ישיבה. בפנים: מחיצות צמחייה ניידות, אדניות תעלה וכדים גדולים."),
            ("הצמחייה", "סטרליציה, מונסטרה, סנסווריה, דרצנה ופוטוס. צמחי פנים שמחזיקים תאורת משרד לאורך זמן."),
        ],
        "facts": ["גג ופנים", "בריכת השתקפות", "מחיצות ירוקות", "צמחיית פנים"],
        "hero_alt": "פינת ישיבה על הגג: כדים שחורים עם דקלים וצמחייה שופעת",
        "gallery_alts": [
            "גג המרפסת: כורסת עץ לבנה, דקלים ובריכת השתקפות",
            "גג המשרדים: דקלי אריקה באדניות, בריכת השתקפות וספסל לבן",
            "כניסה עם דלתות זכוכית שחורות ואדניות",
            "מונסטרות באדנית תעלה על רקע קיר עץ",
            "דיפנבכיה בכד כהה מול קיר משושים",
            "שולחן סנוקר לצד סטרליציה בכד שחור",
        ],
    },
    {
        "slug": "empathy-offices",
        "title": "משרדי אמפתי",
        "seo_title": "גינון למשרדים בקומת מגדל — אמפתי | גן פרא",
        "meta": "משרדים · קומת מגדל",
        "cat": "offices",
        "span2": False,
        "short": "קומת משרדים במגדל מול נוף תל אביב: פיקוסים, קנטיות ואלוקסיות בכדי בטון, ואדניות שמחלקות את החלל.",
        "story": [
            ("הפרויקט", "הצמחת קומת משרדים שלמה במגדל. הצמחייה עושה גם עיצוב וגם פונקציה: אדניות תעלה מחלקות את החלל הפתוח בלי קירות."),
            ("מה הקמנו", "עשרות כדי בטון בגדלים שונים, אדניות תעלה לבנות באזורים המשותפים והצבה נקודתית בחדרי ישיבות ופינות המתנה."),
            ("הצמחייה", "פיקוס כינורי, קנטיה, רפיס, דרצנה, אלוקסיה ומונסטרה. כל צמח נבחר לפי כמות האור באזור שלו בקומה."),
        ],
        "facts": ["קומת מגדל", "חלוקת חלל ירוקה", "כדי בטון", "צמחי פנים גדולים"],
        "hero_alt": "שורת אדניות לבנות שמחלקת את החלל המשותף, עם תקרת מסגרות עץ",
        "gallery_alts": [
            "פיקוס כינורי בכד שחור מול קיר מסך עם נוף",
            "אדנית תעלה עם צמחייה צפופה מול חלון עם נוף העיר",
            "דקל קנטיה בכד בטון מול נוף מגדלים",
            "דרצנה לצד כיסא בורדו על פרקט פישבון",
            "עלי אלוקסיה על רקע פנורמת העיר",
            "פינת המתנה עם ספה ודקל רפיס",
        ],
    },
    {
        "slug": "cafe-nahat",
        "title": "קפה נחת במתחם התחנה",
        "seo_title": "עיצוב גינה לבית קפה — נחת, מתחם התחנה | גן פרא",
        "meta": "מסחרי · בית קפה",
        "cat": "commercial",
        "span2": True,
        "short": "חצר בית קפה בין מבני אבן היסטוריים: פלומריות בכדים, אדניות שופעות ושרשראות תאורה שעובדות גם בלילה.",
        "story": [
            ("הפרויקט", "הצמחת חצר ומתחם ישיבה של בית קפה במתחם אבן היסטורי. הצמחייה מחזיקה עומס אורחים יומיומי ונראית טוב גם בתאורת ערב."),
            ("מה הקמנו", "עצי פלומריה בכדים גדולים, אדניות ניידות סביב עמדות השמשיות ומטפסים על קירות האבן. בפנים: סטרליציות וכדי סנסווריה."),
            ("הצמחייה", "פלומריה פורחת, שרכים, קוליאוס ופרחים עונתיים. שתילה שנבחרה לצל חלקי של חצר אבן."),
        ],
        "facts": ["מסחרי", "עמידות לעומס", "יום ולילה", "כדים ניידים"],
        "hero_alt": "סמטת האבן ביום: פלומריה פורחת בכד גדול ושרשראות תאורה",
        "gallery_alts": [
            "פלומריה פורחת מוארת על רקע קיר אבן בלילה",
            "עלי סטרליציה לצד ספריית עץ",
            "אדנית שרכים וקוליאוס לצד כיסאות ביסטרו",
            "אדניות פרחים סביב עמודי השמשיות",
            "אזור ישיבה תחת שמשייה עם עצים בכדים",
            "חצר בית הקפה בלילה: שרשראות תאורה ומבני אבן",
        ],
    },
    {
        "slug": "cafe-ada",
        "title": "קפה אדא בלווינסקי",
        "seo_title": "עיצוב גינה לבית קפה — אדא, לווינסקי | גן פרא",
        "meta": "מסחרי · בית קפה",
        "cat": "commercial",
        "span2": False,
        "short": "אלוקסיות ענק וסטרליציות בין קירות לבנים חשופות וגג נפתח. ירוק שהוא חלק מהעיצוב, לא קישוט.",
        "story": [
            ("הפרויקט", "הצמחת פנים של בית קפה אורבני עם גג נפתח. שילוב של קירות לבנים חשופות, חיפויי עץ וברזל שחור."),
            ("מה הקמנו", "אלוקסיות ענק בכדים ירוקי זית במרכז החלל, סטרליציות ניקולאי בין השולחנות ופוטוס משתפל מקיר הלבנים ומרמקולי העץ."),
            ("הצמחייה", "אלוקסיה, סטרליציה ניקולאי ופוטוס. מעט מינים, נוכחות גדולה."),
        ],
        "facts": ["הצמחת פנים", "גג נפתח", "קנה מידה גדול", "מעט מינים"],
        "hero_alt": "עלי אלוקסיה ענקיים בכד ירוק זית מעל שולחנות בית הקפה",
        "gallery_alts": [
            "אלוקסיה בכד כהה מול מחיצת עץ וקיר לבנים עם יסמין",
            "קיר לבנים עם פוטוס משתפל מרמקול עץ",
            "פינת הבר עם זכוכית צבעונית וצמח בכד",
            "מבט רחב על פינת הישיבה עם סטרליציה",
            "סטרליציה ניקולאי בין שולחנות העץ",
            "סטרליציה מול קורות שחורות וגג הזכוכית",
        ],
    },
]


def wa_link(title):
    txt = urllib.parse.quote(f"היי, ראיתי את הפרויקט \"{title}\" באתר ואשמח לשמוע עוד")
    return f"https://wa.me/972545525124?text={txt}"


def head(title, desc, canonical, og_image, extra=""):
    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-2EYWMVWQ26"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() {{ dataLayer.push(arguments); }}
    gtag('js', new Date());
    gtag('config', 'G-2EYWMVWQ26');
  </script>
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{og_image}" />
  <meta property="og:locale" content="he_IL" />
  <!-- Preload critical above-the-fold fonts -->
  <link rel="preload" as="font" type="font/woff2" href="fonts/TelAviv-BrutalistBold.woff2" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="fonts/TelAviv-ModernistRegular.woff2" crossorigin />
  <link rel="stylesheet" href="shared.css" />
  <link rel="stylesheet" href="lp.css" />
  <link rel="stylesheet" href="projects.css" />
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)}};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1540558887542255');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1540558887542255&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
  <!-- מעבר חוצה-דפים בין הארכיון לעמוד הפרויקט. חל רק על 14 העמודים
       שהסקריפט הזה מייצר (שני הצדדים חייבים להסכים), ולכן index.html —
       שטוען את אותו projects.css — לא מושפע. דפדפן ללא תמיכה מנווט
       כרגיל, בלי שום חיווי. -->
  <style>
    @view-transition {{ navigation: auto; }}
    /* בלי זה שני הצילומים נמתחים למלבן הקבוצה: התמונה בארכיון היא
       thumb ביחס אחד וה-hero ביחס אחר, וחצי מהכרטיסים היו נמעכים
       באמצע המעבר — בדיוק הכשל שמנע את המעבר ל-FLIP. */
    ::view-transition-old(pj-hero),
    ::view-transition-new(pj-hero) {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}
    @media (prefers-reduced-motion: reduce) {{
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) {{ animation: none !important; }}
    }}
  </style>
{extra}</head>
<body>

"""


def breadcrumb_ld(items):
    lis = ", ".join(
        f'{{"@type": "ListItem", "position": {i+1}, "name": "{n}", "item": "{u}"}}'
        for i, (n, u) in enumerate(items)
    )
    return f'  <script type="application/ld+json">\n {{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{lis}]}}\n </script>\n'


def tail(wa):
    return f"""
<script src="lp.js" defer></script>

<!-- FLOATING WA -->
<a href="{wa}"
   class="lp-float-wa" aria-label="פתח WhatsApp"
   data-track="float">
  <svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.532 5.852L.054 23.05a.75.75 0 00.916.916l5.198-1.478A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.943 0-3.772-.524-5.345-1.44l-.383-.225-3.085.877.877-3.085-.225-.383A9.951 9.951 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
</a>


<script src="nav.js" defer></script>
<script src="/track.js" defer></script>
</body>
</html>
"""


def build_archive(nav, footer):
    cards = []
    for p in PROJECTS:
        span = " span2" if p["span2"] else ""
        cards.append(f"""    <div class="pj-card{span}" data-cat="{p['cat']}" tabindex="0" role="button"
         aria-label="{p['title']} — פתיחת תצוגה"
         data-title="{p['title']}" data-meta="{p['meta']}"
         data-desc="{p['short']}" data-href="project-{p['slug']}.html">
      <img src="images/projects/{p['slug']}/thumb.webp" alt="{p['hero_alt']}" loading="lazy"{dims(f"images/projects/{p['slug']}/thumb.webp")} />
      <div class="pj-tag">{p['title']} <small>{CATS[p['cat']]}</small></div>
    </div>""")
    filters = ['<button class="pj-filter-btn active" data-cat="all">הכל</button>'] + [
        f'<button class="pj-filter-btn" data-cat="{k}">{v}</button>' for k, v in CATS.items()
    ]
    desc = "גלריית הפרויקטים של גן פרא: גינות קרקע, מרפסות, פנטהאוזים, משרדים ובתי קפה שתכננו והקמנו במרכז הארץ."
    h = head(
        "פרויקטים | גן פרא — תכנון והקמת גינות",
        desc,
        f"{SITE}/projects.html",
        f"{SITE}/images/projects/graytzer/hero.webp",
        breadcrumb_ld([("ראשי", f"{SITE}/"), ("פרויקטים", f"{SITE}/projects.html")]),
    )
    wa = "https://wa.me/972545525124?text=" + urllib.parse.quote("היי, ראיתי את הפרויקטים באתר ואשמח לשמוע עוד")
    body = f"""{nav}

<header class="pj-head">
  <div class="pj-kicker reveal">הפרויקטים שלנו</div>
  <h1 class="reveal">פרויקטים נבחרים</h1>
  <p class="reveal">מבחר מתוך יותר ממאה גינות שתכננו והקמנו. לחצו על פרויקט כדי להתקרב.</p>
</header>

<div class="pj-filter">
  {'\n  '.join(filters)}
</div>

<div class="pj-wrap">
  <div class="pj-grid">
{chr(10).join(cards)}
  </div>
</div>

<div class="pj-backdrop" id="pjBackdrop"></div>
<div class="pj-morph" id="pjMorph" role="dialog" aria-modal="true">
  <button class="pj-close" id="pjClose" aria-label="סגירה">✕</button>
  <img id="pjMorphImg" src="" alt="" />
  <div class="pj-info">
    <div class="pj-meta" id="pjMeta"></div>
    <h2 id="pjTitle"></h2>
    <p id="pjDesc"></p>
    <a class="pj-cta" id="pjCta" href="#">לעמוד הפרויקט המלא ←</a>
  </div>
</div>

<!-- FINAL CTA -->
<section class="lp-final-cta">
  <p class="lp-section-label reveal">בואו נדבר</p>
  <h2 class="reveal">רוצים גינה כזאת אצלכם?</h2>
  <p class="reveal">מתחילים בשיחת אפיון ללא התחייבות. נבין את החלל, ונגיד לכם בכנות מה אפשר לעשות</p>
  <a href="{wa}" class="btn-arrow on-light" data-track="final" aria-label="שלחו הודעה עכשיו">
      <span class="btn-arrow-label">שלחו הודעה עכשיו</span>
      <span class="btn-arrow-icon" aria-hidden="true">
        <svg class="a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 7 7"/><path d="M7 17V7h10"/></svg>
        <svg class="a2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 7 7"/><path d="M7 17V7h10"/></svg>
      </span>
    </a>
  <p class="lp-sub">עונים בהקדם · <a href="quiz/" style="color: inherit">שאלון אפיון הגינה ←</a></p>
</section>

{footer}
"""
    return h + body + tail(wa) + '<script src="projects.js" defer></script>\n'


def build_project(p, prev_p, next_p, nav, footer):
    slug = p["slug"]
    base = f"images/projects/{slug}"
    n_gallery = len(p["gallery_alts"])

    photos_items = "\n".join(
        f'''      <figure class="pjd-photo reveal"><img src="{base}/g{i+1}.webp" alt="{alt}" loading="lazy"{dims(f"{base}/g{i+1}.webp")} /></figure>'''
        for i, alt in enumerate(p["gallery_alts"])
    )
    photos = ""
    if photos_items:
        photos = f'''<section class="pjd-photos">
  <div class="pjd-photos-grid">
{photos_items}
  </div>
</section>'''

    before_html = ""
    if p.get("before_alt"):
        after_img = p.get("after_img", "hero.webp")  # ברירת מחדל ה-hero; רמת החייל מצביע על תמונת המדשאה
        before_html = f"""
<div class="pjd-ba">
  <figure class="reveal">
    <img src="{base}/before.webp" alt="{p['before_alt']}" loading="lazy"{dims(f"{base}/before.webp")} />
    <figcaption>{p['before_caption_before']}</figcaption>
  </figure>
  <figure class="reveal">
    <img src="{base}/{after_img}" alt="החצר אחרי ההקמה" loading="lazy"{dims(f"{base}/{after_img}")} />
    <figcaption>{p['before_caption_after']}</figcaption>
  </figure>
</div>
"""

    story = "\n".join(
        f"""  <div class="pjd-story-block reveal">
    <h2>{t}</h2>
    <p>{txt}</p>
  </div>"""
        for t, txt in p["story"]
    )
    facts = "\n".join(f'  <span class="pjd-fact">{f}</span>' for f in p["facts"])

    wa = wa_link(p["title"])
    canonical = f"{SITE}/project-{slug}.html"
    desc = p["short"]
    h = head(
        p.get("seo_title") or f"{p['title']} | פרויקטים | גן פרא",
        desc,
        canonical,
        f"{SITE}/{base}/hero.webp",
        breadcrumb_ld([("ראשי", f"{SITE}/"), ("פרויקטים", f"{SITE}/projects.html"), (p["title"], canonical)])
        + f'  <link rel="preload" as="image" href="{base}/hero.webp" />\n',
    )
    body = f"""{nav}

<section class="pjd-hero">
  <img src="{base}/hero.webp" alt="{p['hero_alt']}" fetchpriority="high"{dims(f"{base}/hero.webp")} />
  <div class="pjd-hero-inner">
    <div class="pjd-crumb"><a href="projects.html">→ כל הפרויקטים</a></div>
    <div class="pjd-meta">{p['meta']}</div>
    <h1>{p['title']}</h1>
  </div>
</section>

<section class="pjd-story">
{story}
</section>

<div class="pjd-facts">
{facts}
</div>
{before_html}
{photos}

<div class="pjd-nav">
  <a href="project-{prev_p['slug']}.html">→ {prev_p['title']}</a>
  <a href="projects.html">כל הפרויקטים</a>
  <a href="project-{next_p['slug']}.html">{next_p['title']} ←</a>
</div>

<!-- FINAL CTA -->
<section class="lp-final-cta">
  <p class="lp-section-label reveal">בואו נדבר</p>
  <h2 class="reveal">רוצים גינה כזאת אצלכם?</h2>
  <p class="reveal">מתחילים בשיחת אפיון ללא התחייבות. נבין את החלל, ונגיד לכם בכנות מה אפשר לעשות</p>
  <a href="{wa}" class="btn-arrow on-light" data-track="final" aria-label="שלחו הודעה עכשיו">
      <span class="btn-arrow-label">שלחו הודעה עכשיו</span>
      <span class="btn-arrow-icon" aria-hidden="true">
        <svg class="a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 7 7"/><path d="M7 17V7h10"/></svg>
        <svg class="a2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 7 7"/><path d="M7 17V7h10"/></svg>
      </span>
    </a>
  <p class="lp-sub">עונים בהקדם · <a href="quiz/" style="color: inherit">שאלון אפיון הגינה ←</a></p>
</section>

{footer}
"""
    return h + body + tail(wa)


def main():
    nav = open(os.path.join(ROOT, "partials/nav.html"), encoding="utf-8").read().rstrip("\n")
    footer = open(os.path.join(ROOT, "partials/footer.html"), encoding="utf-8").read().rstrip("\n")

    out = os.path.join(ROOT, "projects.html")
    open(out, "w", encoding="utf-8").write(build_archive(nav, footer))
    print(f"✓ projects.html ({len(PROJECTS)} פרויקטים)")

    for i, p in enumerate(PROJECTS):
        prev_p = PROJECTS[i - 1]
        next_p = PROJECTS[(i + 1) % len(PROJECTS)]
        path = os.path.join(ROOT, f"project-{p['slug']}.html")
        open(path, "w", encoding="utf-8").write(build_project(p, prev_p, next_p, nav, footer))
        print(f"✓ project-{p['slug']}.html")

    print(f"\nסה\"כ {len(PROJECTS) + 1} עמודים נוצרו.")


if __name__ == "__main__":
    main()
