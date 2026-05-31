# מאמרי הבלוג של גן פרא — מדריך לייצור מאמרים

> קרא קובץ זה לפני כתיבת כל מאמר חדש. הוא מכיל את התבנית, כללי הסגנון, רשימת המאמרים הקיימים, ונהלי ה-SEO.

---

## תהליך הייצור — סדר פעולות קבוע

1. **קרא את החומר הגלם** (PDF, טקסט, הערות) — הבן את הנושא לעומק
2. **בחר שם קובץ** — פורמט: `blog-[נושא].html` באנגלית (דוגמה: `blog-etz-zayit.html`)
3. **כתוב את המאמר** לפי התבנית למטה
4. **עדכן את `index.html`** ב-3 מקומות:
   - תפריט דסקטופ (dropdown מאמרים) — הוסף `<a href="...">` לפני `<div class="nav-dd-sep">`
   - תפריט מובייל — הוסף `<a>` בתוך `<div class="nav-mobile-links" id="mob-blog">`
   - גריד הבלוג בסעיף `#blog` — מציג **6 כרטיסים בלבד** (החדשים קודם). הוסף/הסר לפי הצורך. הכפתור "לכל המאמרים" כבר קיים ומצביע ל-`blog.html`
5. **עדכן את `blog.html`** — הוסף כרטיס `<a href="..." class="blog-card" data-cat="[קטגוריה]">` בתחילת הגריד (הכרטיס החדש תמיד ראשון)
5. **הוסף רשומה לטבלת המאמרים** בקובץ זה (בסוף)

---

## כללי סגנון — מה שמייחד את הבלוג של גן פרא

**הקהל:** בעלי דירות יוקרה, פנטהאוזים, וילות ועסקים. אנשים שמוכנים להשקיע ורוצים לדעת שהם בידיים טובות.

**טון:** מקצועי, ישיר, בגובה העיניים. לא אקדמי, לא פופולרי מדי. כמו ייעוץ מגינן מנוסה שמסביר לחבר.

**מה אסור:**
- כותרות קליקבייט ("5 סיבות שיפתיעו אתכם!")
- משפטים כלליים ("הגינה חשובה לאיכות החיים")
- אזהרות מיותרות
- שגרות ("בוודאי!", "שאלה מצוינת!")
- ז'רגון מקצועי לא מוסבר

**מה חובה:**
- מידע פרקטי שהקורא יכול ליישם
- מספרים ונתונים ספציפיים (לא "בערך" — "300 ק"ג למ"ר")
- הפניה לניסיון מהשטח של גן פרא
- CTA שמחבר לשירות רלוונטי (מרפסת → עמוד מרפסת, פנטהאוז → עמוד פנטהאוז)

**אורך:** 600–900 מילים. לא פחות (שטחי) ולא יותר (מייגע).

**מבנה מאמר טיפוסי:**
```
פסקת פתיחה — מסגרת הנושא + ערך למשתמש
h2: בדיקות / שלב 0 (מה לבדוק לפני)
h2: עצות עיקריות (לפי נושאי-משנה)
  h3: כל נושא-משנה
warning-box: הדבר שהכי חשוב לשים לב אליו
h2: עצה מעשית נוספת
סיכום קצר (לא "לסיכום")
CTA section
```

---

## תבנית HTML — העתק מכאן לכל מאמר חדש

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[כותרת המאמר] | גן פרא</title>
  <meta name="description" content="[תיאור SEO — 140–160 תווים, מכיל מילות מפתח]" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://ganpereh.co.il/[שם-הקובץ].html" />
  <meta property="og:title" content="[כותרת קצרה] | גן פרא" />
  <meta property="og:description" content="[תיאור 100–150 תווים]" />
  <meta property="og:url" content="https://ganpereh.co.il/[שם-הקובץ].html" />
  <meta property="og:locale" content="he_IL" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"[כותרת]","author":{"@type":"Organization","name":"גן פרא"},"publisher":{"@type":"Organization","name":"גן פרא","url":"https://ganpereh.co.il"},"datePublished":"[YYYY-MM-DD]","description":"[תיאור קצר]"}
  </script>
  <link rel="stylesheet" href="shared.css" />
  <style>
    .article-meta { color: var(--text-light); font-size: 0.9rem; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 1px solid var(--cream-dark); }
    .warning-box { background: #FFF8F5; border-right: 4px solid var(--green-accent); border-radius: 12px; padding: 20px 24px; margin: 28px 0; }
    .warning-box p { margin: 0; color: var(--text-mid); }
  </style>
</head>
<body>

<nav>
  <a href="index.html" class="nav-logo">גן <em>פרא</em></a>
  <div class="nav-right">
    <a href="tel:0543341118" class="nav-phone">054-334-1118</a>
    <a href="quiz.html" class="nav-cta">הצעת מחיר</a>
  </div>
</nav>

<div class="page-hero">
  <div class="breadcrumb"><a href="index.html">ראשי</a> ← בלוג</div>
  <h1>[שורה 1 של הכותרת]<br>[שורה 2 — תת-כותרת]</h1>
  <p>[תיאור קצר — 1 משפט, מה הקורא ייקח מהמאמר]</p>
</div>

<div class="article-wrap">
  <div class="article-meta">גן פרא · [חודש שנה] · זמן קריאה: [X] דקות</div>

  <p>[פסקת פתיחה]</p>

  <h2>[כותרת פרק ראשי]</h2>
  <h3>[כותרת נושא-משנה]</h3>
  <p>[תוכן]</p>

  <div class="warning-box">
    <p>⚠️ <strong>[תווית]:</strong> [תוכן ה-callout]</p>
  </div>

  <!-- הוסף h2, h3, p, ul, ol, table לפי הצורך -->

</div>

<section class="cta-section">
  <h2>[כותרת CTA — שאלה או הצעה]</h2>
  <p>[תת-כותרת — מה קורה אחרי שיוצרים קשר]</p>
  <div class="cta-btns">
    <a href="https://wa.me/9720543341118?text=היי%2C%20[טקסט%20ווצאפ%20מקודד]" class="btn-wa" target="_blank" rel="noopener">
      <!-- SVG WhatsApp — העתק מכל מאמר קיים -->
      קבעו ביקור ב-WhatsApp
    </a>
    <a href="[עמוד-רלוונטי].html" class="btn-outline">[טקסט כפתור משני]</a>
  </div>
</section>

<footer>
  <div class="footer-logo">גן <em>פרא</em></div>
  <div class="footer-tagline">עיצוב והקמת גינות · מרכז הארץ</div>
  <div class="footer-links">
    <a href="index.html">ראשי</a>
    <a href="penthouse.html">גינת פנטהאוז</a>
    <a href="mirpeset.html">גינת מרפסת</a>
    <a href="asakim.html">גינות לעסקים</a>
    <a href="index.html#contact">צור קשר</a>
  </div>
  <div class="footer-divider"></div>
  <p class="footer-copy">© 2026 גן פרא - כל הזכויות שמורות</p>
</footer>

<!-- WhatsApp float + sticky bar — העתק מכל מאמר קיים -->
</body>
</html>
```

---

## תוספות לindex.html — מה לשנות בכל מאמר חדש

### 1. תפריט דסקטופ (dropdown)
חפש: `<div class="nav-dd-sep"></div>` — הוסף לפניו:
```html
<a href="[שם-קובץ].html" class="nav-dd-link">[שם קצר למאמר]</a>
```

### 2. תפריט מובייל
חפש: `<div class="nav-mobile-links" id="mob-blog">` — הוסף בסוף הקבוצה:
```html
<a href="[שם-קובץ].html" class="nav-mobile-link">[שם קצר למאמר]</a>
```

### 3. כרטיס בגריד הבלוג
חפש את הסגירה `</div>` של `.blog-grid` — הוסף לפניה:
```html
<a href="[שם-קובץ].html" class="blog-card">
  <span class="blog-card-tag">[קטגוריה]</span>
  <div class="blog-card-title">[כותרת מאמר]</div>
  <div class="blog-card-desc">[תיאור קצר — 1-2 משפטים]</div>
  <div class="blog-card-footer">
    <span class="blog-card-read">קרא עוד ←</span>
  </div>
</a>
```

**קטגוריות קיימות:** `תכנון ותקציב` / `צמחים וגידול` / `פנטהאוז וגג` / `מרפסת` / `עסקים`

---

## רשימת המאמרים הקיימים

| שם קובץ | נושא | תאריך | קטגוריה |
|---------|------|--------|---------|
| `blog-kama-ole-gina.html` | כמה עולה הקמת גינה — מדריך מחירים | מאי 2026 | תכנון ותקציב |
| `blog-tzme-mirpeset.html` | 10 צמחים מושלמים למרפסת בתל אביב | מאי 2026 | צמחים וגידול |
| `blog-ginat-penthouse.html` | גינת פנטהאוז — המדריך המלא | מאי 2026 | פנטהאוז וגג |
| `blog-etz-zayit.html` | עץ הזית בגינה הפרטית — מה לדעת לפני שנוטעים | מאי 2026 | צמחים וגידול |
| `blog-gina-tvalin-mirpeset.html` | גינת תבלינים במרפסת — איך עושים נכון | מאי 2026 | מרפסת |
| `blog-gan-yerek-mirpeset.html` | גן ירק במרפסת — המדריך המלא | מאי 2026 | מרפסת |
| `blog-gina-bar-kayama.html` | גינה בת-קיימא — מה זה אומר בפועל | מאי 2026 | תכנון וסביבה |
| `blog-tzamahim-yitushim.html` | צמחים שדוחים יתושים — מה באמת עובד ומה מיתוס | מאי 2026 | צמחים וגידול |
| `blog-klei-gina-tihzuka.html` | תחזוקת כלי גינון — איך שומרים על הכלים לאורך שנים | מאי 2026 | תכנון ותקציב |

---

## SEO — רשימת בדיקות לפני פרסום

- [ ] `<title>` מכיל את מילת המפתח הראשית + "| גן פרא"
- [ ] `<meta description>` 140–160 תווים, מכיל 1–2 מילות מפתח
- [ ] `<link rel="canonical">` מצביע על ה-URL הנכון
- [ ] `h1` אחד בלבד, מכיל את הנושא הראשי
- [ ] `h2` / `h3` מסודרים בהיררכיה נכונה (לא דלגים)
- [ ] כל תמונה (עתידית) עם `alt` בעברית
- [ ] Schema.org `Article` מעודכן עם `datePublished` נכון
- [ ] קישור `canonical` נוסף ב-sitemap.xml
- [ ] שם קובץ באנגלית, מבוסס מילות מפתח

---

## תהליך: כתבה מהדייג'סט → מאמר לאתר

כאשר ירין מבקש להפוך כתבה ממייל הדייג'סט למאמר לאתר, הוא יאמר משהו כמו:
"קרא את הכתבה הזאת ועשה מחקר ומאמר לאתר: [URL]"

**סדר הפעולות:**

1. **קרא את הכתבה המלאה** — השתמש ב-WebFetch על ה-URL שנשלח
2. **מחקר תומך** — חפש 2-3 מקורות נוספים שמחזקים את הנושא (WebSearch)
3. **זהה את הזווית הרלוונטית לקהל של גן פרא** — בעלי נכסי יוקרה, מרכז הארץ, גינות פרמיום. אל תתרגם — אדפט.
4. **כתוב מאמר חדש לחלוטין בעברית** — לא תרגום, מאמר מקורי שמתבסס על הידע + נקודת המבט של גן פרא
5. **צור את קובץ ה-HTML** לפי התבנית בקובץ זה
6. **עדכן את index.html** בשלושת המקומות (dropdown, mobile, blog-grid)
7. **עדכן את sitemap.xml** — הוסף רשומה לדף החדש
8. **הוסף רשומה לטבלת המאמרים** בקובץ זה

**מה לא לעשות:**
- לא לתרגם את הכתבה מילה במילה
- לא לאזכר את המקור המקורי במאמר
- לא לכתוב "בהשראת" — המאמר של גן פרא הוא עצמאי

---

## הערות כלליות

- כל ה-SVG של WhatsApp — זהה בכל הקבצים, העתק מקובץ קיים
- `shared.css` מטפל בכל הסגנון — לא להוסיף CSS ייחודי למאמרים (חוץ מ-`article-meta` ו-`warning-box` שמוגדרים ב-`<style>` פנימי בכל מאמר)
- `wa-float` ו-`sticky-wa-bar` — חובה בכל מאמר, העתק מקובץ קיים עם URL ווצאפ מותאם לנושא המאמר
