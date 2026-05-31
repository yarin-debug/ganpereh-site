// ============================================================
// גן פרא — סיכום כתבות גינון יומי
// Google Apps Script | שולח מייל כל בוקר ב-08:00
//
// הגדרה ראשונית: הרץ את setupDailyTrigger() פעם אחת בלבד
// ============================================================

var CONFIG = {
  recipient:   'yarin@ganpereh.co.il',
  maxArticles: 6,
  feeds: [
    { name: 'Gardenista',                  url: 'https://www.gardenista.com/feed/' },
    { name: 'Garden Design Magazine',      url: 'https://www.gardendesign.com/feed/' },
    { name: 'Dezeen — Landscapes',         url: 'https://www.dezeen.com/tag/gardens/feed/' },
    { name: 'Architectural Digest',        url: 'https://www.architecturaldigest.com/feed/rss' },
    { name: 'Fine Gardening',              url: 'https://www.finegardening.com/feed' },
    { name: 'Landscape Architecture Mag',  url: 'https://landscapearchitecturemagazine.org/feed/' },
    { name: 'Gardens Illustrated',         url: 'https://www.gardensillustrated.com/feed/' },
    { name: 'House Beautiful — Garden',    url: 'https://www.housebeautiful.com/rss/all.xml' }
  ]
};

// ============================================================
// פונקציה ראשית — נקראת אוטומטית כל בוקר ב-08:00
// ============================================================
function sendGardenDigest() {
  var articles = fetchAllArticles();

  if (articles.length === 0) {
    Logger.log('לא נמצאו כתבות היום.');
    return;
  }

  var html    = buildEmailHTML(articles);
  var subject = buildSubject();

  GmailApp.sendEmail(CONFIG.recipient, subject, '', { htmlBody: html, name: 'גן פרא — דייגף גינון' });
  Logger.log('נשלח: ' + subject);
}

// ============================================================
// שליפה ועיבוד כתבות
// ============================================================
function fetchAllArticles() {
  var all = [];

  for (var i = 0; i < CONFIG.feeds.length; i++) {
    var feed = CONFIG.feeds[i];
    try {
      var articles = parseFeed(feed);
      all = all.concat(articles);
    } catch (e) {
      Logger.log('שגיאה ב-' + feed.name + ': ' + e.message);
    }
  }

  // מיון לפי תאריך — חדש ראשון
  all.sort(function(a, b) {
    return new Date(b.rawDate) - new Date(a.rawDate);
  });

  // סינון כפילויות לפי כותרת
  var seen   = {};
  var unique = [];
  for (var j = 0; j < all.length; j++) {
    var key = all[j].title.toLowerCase().substring(0, 40);
    if (!seen[key]) {
      seen[key] = true;
      unique.push(all[j]);
    }
  }

  return unique.slice(0, CONFIG.maxArticles);
}

function parseFeed(feed) {
  var response = UrlFetchApp.fetch(feed.url, {
    muteHttpExceptions: true,
    followRedirects:    true,
    headers:            { 'User-Agent': 'Mozilla/5.0 (compatible; GardenDigest/1.0)' }
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(feed.name + ' — קוד: ' + response.getResponseCode());
    return [];
  }

  var content = response.getContentText();
  var xml     = XmlService.parse(content);
  var root    = xml.getRootElement();

  // תמיכה ב-RSS 2.0 ו-Atom
  var ns      = XmlService.getNamespace('');
  var channel = root.getChild('channel');
  var items   = channel ? channel.getChildren('item') : root.getChildren('entry');

  var results = [];
  var limit   = Math.min(items.length, 3);

  for (var i = 0; i < limit; i++) {
    var item  = items[i];
    var title = getChildText(item, 'title');
    var link  = getChildText(item, 'link') || getAttrLink(item);
    var desc  = cleanText(getChildText(item, 'description') || getChildText(item, 'summary') || '');
    var date  = getChildText(item, 'pubDate') || getChildText(item, 'published') || '';

    if (!title || !link) continue;

    // קיצור תיאור ל-250 תווים
    if (desc.length > 250) desc = desc.substring(0, 247) + '...';

    results.push({
      source:   feed.name,
      title:    title.trim(),
      link:     link.trim(),
      desc:     desc,
      rawDate:  date
    });
  }

  return results;
}

function getChildText(element, name) {
  var child = element.getChild(name);
  return child ? child.getValue() : '';
}

function getAttrLink(element) {
  // Atom feeds use <link href="...">
  var link = element.getChild('link');
  return link ? link.getAttribute('href').getValue() : '';
}

function cleanText(text) {
  return text
    .replace(/<[^>]*>/g, '')    // הסר HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// תרגום לעברית
// ============================================================
function translateToHebrew(text) {
  if (!text || text.trim() === '') return '';
  try {
    return LanguageApp.translate(text, 'en', 'iw');
  } catch (e) {
    return text;
  }
}

// ============================================================
// בניית אימייל HTML
// ============================================================
function buildEmailHTML(articles) {
  var date = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy');

  var articlesHTML = '';
  for (var i = 0; i < articles.length; i++) {
    var a      = articles[i];
    var titleHe = translateToHebrew(a.title);
    var descHe  = a.desc ? translateToHebrew(a.desc) : '';

    var isLast = (i === articles.length - 1);
    var border = isLast ? '' : 'border-bottom: 1px solid #E8E0D5;';

    articlesHTML += [
      '<div style="padding: 28px 0; ' + border + '">',

        '<div style="font-size: 11px; color: #9B8B70; text-transform: uppercase;',
        '     letter-spacing: 1px; margin-bottom: 10px; font-family: Arial, sans-serif;">',
        escapeHtml(a.source),
        '</div>',

        '<h2 style="font-size: 17px; color: #1F3320; margin: 0 0 10px;',
        '     line-height: 1.5; font-family: Arial, sans-serif; font-weight: 700;">',
        escapeHtml(titleHe),
        '</h2>',

        descHe ? (
          '<p style="font-size: 14px; color: #555; line-height: 1.75; margin: 0 0 16px;' +
          '     font-family: Arial, sans-serif;">' +
          escapeHtml(descHe) +
          '</p>'
        ) : '',

        '<a href="' + a.link + '"',
        '   style="display: inline-block; background: #2C4A2E; color: #FFFFFF;',
        '          padding: 9px 20px; border-radius: 6px; text-decoration: none;',
        '          font-size: 13px; font-family: Arial, sans-serif; font-weight: 600;">',
        'לכתבה המלאה &larr;',
        '</a>',

      '</div>'
    ].join('');
  }

  return [
    '<!DOCTYPE html>',
    '<html dir="rtl" lang="he">',
    '<body style="margin:0; padding:0; background:#F2EDE7;">',

    '<div style="max-width:620px; margin:32px auto; background:#FFFFFF;',
    '     border-radius:14px; overflow:hidden;',
    '     box-shadow: 0 2px 16px rgba(0,0,0,0.09);">',

      // Header
      '<div style="background:#2C4A2E; padding:36px 44px; text-align:center;">',
        '<div style="color:#A8D5A2; font-size:11px; letter-spacing:3px; margin-bottom:10px;',
        '     font-family:Arial,sans-serif; text-transform:uppercase;">גן פרא</div>',
        '<h1 style="color:#FFFFFF; font-size:21px; margin:0; font-family:Arial,sans-serif;',
        '     font-weight:700; line-height:1.3;">סיכום כתבות גינון יומי</h1>',
        '<div style="color:#C5E5C0; margin-top:10px; font-size:13px;',
        '     font-family:Arial,sans-serif;">' + date + '</div>',
      '</div>',

      // Articles body
      '<div style="padding: 4px 44px 12px;">',
        articlesHTML,
      '</div>',

      // Footer
      '<div style="background:#F8F4EF; padding:22px 44px; border-top:1px solid #E8E0D5; text-align:center;">',
        '<p style="font-size:12px; color:#9B8B70; margin:0; font-family:Arial,sans-serif; line-height:1.6;">',
        'כדי להפוך כתבה למאמר לאתר — שלח את הקישור לקלוד עם הבקשה: ',
        '<em>"קרא את הכתבה הזאת ועשה מחקר ומאמר לאתר"</em>',
        '</p>',
      '</div>',

    '</div>',
    '</body>',
    '</html>'
  ].join('\n');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSubject() {
  var date = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy');
  return 'גן פרא | כתבות גינון ' + date;
}

// ============================================================
// הגדרת טריגר יומי — הרץ פעם אחת בלבד מה-Editor
// ============================================================
function setupDailyTrigger() {
  // מחיקת טריגרים קיימים של הפונקציה הזו
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendGardenDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // יצירת טריגר חדש: כל יום ב-08:00 שעון ישראל
  ScriptApp.newTrigger('sendGardenDigest')
    .timeBased()
    .atHour(8)
    .nearMinute(0)
    .inTimezone('Asia/Jerusalem')
    .everyDays(1)
    .create();

  Logger.log('טריגר הוגדר: כל יום ב-08:00 שעון ישראל');
}

// ============================================================
// שליחת מייל ניסיון — לבדיקה מיידית מה-Editor
// ============================================================
function sendTestDigest() {
  sendGardenDigest();
  Logger.log('מייל ניסיון נשלח.');
}
