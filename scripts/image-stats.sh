#!/usr/bin/env bash
# Image stats for pilsen-murals — total count, sizes, breakdown by type/dir, largest files.
# Usage: ./scripts/image-stats.sh   or  npm run image-stats

set -e
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

find_args='-type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.gif" -o -iname "*.svg" \)'

human() {
  num="$1"
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "$num" | awk '{ if ($1 >= 1073741824) printf "%.2f GB", $1/1073741824; else if ($1 >= 1048576) printf "%.2f MB", $1/1048576; else if ($1 >= 1024) printf "%.2f KB", $1/1024; else printf "%d B", $1 }'
  else
    numfmt --to=iec-i --suffix=B "$num" 2>/dev/null || echo "${num} B"
  fi
}

echo "=============================================="
echo "  Image stats: $ROOT"
echo "=============================================="

# Total count
total_count=$(eval find "$ROOT" $find_args 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Total image files: $total_count"

# By extension
echo ""
echo "By extension:"
for ext in jpg jpeg png webp gif svg; do
  c=$(eval find "$ROOT" -type f -iname \"*.$ext\" 2>/dev/null | wc -l | tr -d ' ')
  [ "$c" -gt 0 ] && echo "  .$ext: $c"
done

# Total size (macOS stat)
total_bytes=0
while IFS= read -r -d '' f; do
  [ -f "$f" ] && total_bytes=$((total_bytes + $(stat -f%z "$f" 2>/dev/null || echo 0)))
done < <(eval find "$ROOT" $find_args -print0 2>/dev/null)

echo ""
echo "Total size: $(human "$total_bytes")"
[ "$total_count" -gt 0 ] && echo "Average size: $(human $((total_bytes / total_count)))"

# By directory (recursive size under each)
echo ""
echo "Size by directory (recursive):"
for dir in public public/images public/images/murals public/images/murals/display public/images/murals/thumbnails app; do
  [ ! -d "$ROOT/$dir" ] && continue
  bytes=0
  while IFS= read -r -d '' f; do
    [ -f "$f" ] && bytes=$((bytes + $(stat -f%z "$f" 2>/dev/null || echo 0)))
  done < <(eval find "$ROOT/$dir" $find_args -print0 2>/dev/null)
  [ "$bytes" -gt 0 ] && echo "  $dir: $(human "$bytes")"
done

# Largest files
echo ""
echo "Largest 10 files:"
eval find "$ROOT" $find_args -type f 2>/dev/null | while read -r f; do
  [ -f "$f" ] && echo "$(stat -f%z "$f" 2>/dev/null) $f"
done | sort -rn | head -10 | while read -r size path; do
  echo "  $(human "$size")  ${path#$ROOT/}"
done

echo ""
echo "=============================================="
