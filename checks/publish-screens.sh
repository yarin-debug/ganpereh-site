#!/usr/bin/env bash
# מעלה את צילומי הלפני/אחרי לענף shaar-tzilumim ומחליף בדוח את הנתיבים
# המקומיים (screens/x.jpg) בכתובות — כך הם מוצגים כתמונות בתגובה ב-PR.
#
# למה ענף ולא צירוף: ה-API של GitHub לא מאפשר לצרף תמונה לתגובה.
# הענף אינו main, ולכן לא מתפרסם באתר. לניקוי: למחוק את הענף — הריצה הבאה יוצרת אותו מחדש.
set -euo pipefail
REPO="${GITHUB_REPOSITORY}"
BR="shaar-tzilumim"
DIR="checks/out/screens"
REPORT="checks/out/report.md"
shopt -s nullglob
files=("$DIR"/*.jpg)
[ ${#files[@]} -gt 0 ] || { echo "אין צילומים לפרסום"; exit 0; }

if ! gh api "repos/$REPO/branches/$BR" > /dev/null 2>&1; then
  # ענף יתום (בלי היסטוריה של האתר) — רק צילומים
  tree=$(gh api -X POST "repos/$REPO/git/trees" -f 'tree[][path]=README.md' -f 'tree[][mode]=100644' \
    -f 'tree[][type]=blob' -f 'tree[][content]=צילומי לפני/אחרי של שער הבדיקות. נוצר אוטומטית; מותר למחוק.' --jq .sha)
  commit=$(gh api -X POST "repos/$REPO/git/commits" -f message="צילומי שער הבדיקות" -f "tree=$tree" --jq .sha)
  gh api -X POST "repos/$REPO/git/refs" -f "ref=refs/heads/$BR" -f "sha=$commit" > /dev/null
fi

prefix="pr-${PR}/${RUN}"
for f in "${files[@]}"; do
  name=$(basename "$f")
  jq -n --arg c "$(base64 -w0 "$f")" --arg m "PR #$PR · $name" --arg b "$BR" '{message:$m,content:$c,branch:$b}' > /tmp/put.json
  gh api -X PUT "repos/$REPO/contents/$prefix-$name" --input /tmp/put.json > /dev/null
done
sed -i "s#](screens/#](https://raw.githubusercontent.com/$REPO/$BR/$prefix-#g" "$REPORT"
echo "פורסמו ${#files[@]} צילומים"
