#!/usr/bin/env bash
# מפרסם את הדוח כתגובה אחת ב-PR ומעדכן אותה בכל ריצה — לא ערימה של תגובות.
set -euo pipefail
REPO="${GITHUB_REPOSITORY}"
BODY="checks/out/report.md"
[ -f "$BODY" ] || { echo "אין דוח — השער לא רץ"; exit 0; }
ID=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '.[] | select(.body | startswith("<!-- shaar-bdikot -->")) | .id' | head -1)
if [ -n "$ID" ]; then
  gh api -X PATCH "repos/$REPO/issues/comments/$ID" -F "body=@$BODY" > /dev/null
else
  gh pr comment "$PR" --repo "$REPO" --body-file "$BODY"
fi
