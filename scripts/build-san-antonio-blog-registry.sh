#!/usr/bin/env bash
set -e

DIR="app/content/blog/san-antonio"
OUT="$DIR/index.tsx"

echo 'import React from "react";' > "$OUT"
echo '' >> "$OUT"

imports=""
entries=""

# Convert PascalCase → dashed slug
slugify() {
  echo "$1" \
    | sed 's/\([a-z0-9]\)\([A-Z]\)/\1-\2/g' \
    | sed 's/\([A-Z]\)\([A-Z][a-z]\)/\1-\2/g' \
    | sed 's/\([a-zA-Z]\)\([0-9]\)/\1-\2/g' \
    | sed 's/\([0-9]\)\([a-zA-Z]\)/\1-\2/g' \
    | tr '[:upper:]' '[:lower:]'
}
for file in "$DIR"/*.tsx; do
  base=$(basename "$file")
  [[ "$base" == "index.tsx" ]] && continue

  component=$(grep -Eo 'export default [A-Za-z0-9_]+' "$file" | awk '{print $3}')
  [[ -z "$component" ]] && { echo "❌ Missing default export in $base"; exit 1; }

  filename="${base%.tsx}"
  slug=$(slugify "$component")

  imports+="import $component from \"./$filename\";\n"
  entries+="  \"$slug\": $component,\n"
done

echo -e "$imports" >> "$OUT"
echo "export const sanAntonioBlogRegistry: Record<string, React.FC> = {" >> "$OUT"
echo -e "$entries" >> "$OUT"
echo "};" >> "$OUT"

echo "✅ San Antonio blog registry rebuilt using component-based slugs"
