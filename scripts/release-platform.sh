#!/bin/sh
# Which targets a tag builds. The platform is not part of the tag name; it is one line "platform: <list>" in the message of the annotated tag
# (lower-case ids unraid, windows-desktop, comma separated, "all"). No such line means all targets.
#
#   sh scripts/release-platform.sh <tag> [git-directory]
#
# Prints key=value lines: platform (what was read, "all" when empty), builds_unraid, builds_windows, label (readable list, for log lines).
# Exit 1 with a reason when the line names something that is not a target (a typo must not silently build nothing).

set -eu

tag="${1:-}"
repo="${2:-.}"
[ -n "$tag" ] || { echo "usage: release-platform.sh <tag> [git-directory]" >&2; exit 1; }

# Only an annotated tag carries a message of its own; for a lightweight tag git would hand out the commit message
message=""
if [ "$(git -C "$repo" cat-file -t "refs/tags/$tag" 2>/dev/null || true)" = "tag" ]; then
    message=$(git -C "$repo" tag -l --format='%(contents)' "$tag" 2>/dev/null || true)
fi
platform=$(printf '%s\n' "$message" | sed -n 's/^platform:[[:space:]]*//p' | head -n 1 | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')

builds_unraid=false
builds_windows=false
label=""
if [ -z "$platform" ]; then
    platform=all
fi

old_ifs=$IFS
IFS=','
for id in $platform; do
    case "$id" in
        all)
            builds_unraid=true
            builds_windows=true
            name="All"
            ;;
        unraid)
            builds_unraid=true
            name="Unraid"
            ;;
        windows-desktop|windows)
            builds_windows=true
            name="Windows Desktop"
            ;;
        '')
            continue
            ;;
        *)
            IFS=$old_ifs
            echo "error: unknown platform '$id' in the message of tag $tag (allowed: unraid, windows-desktop, all)." >&2
            exit 1
            ;;
    esac
    label="${label:+$label, }$name"
done
IFS=$old_ifs

if [ "$builds_unraid" = false ] && [ "$builds_windows" = false ]; then
    echo "error: tag $tag selects no target." >&2
    exit 1
fi

printf 'platform=%s\n' "$platform"
printf 'builds_unraid=%s\n' "$builds_unraid"
printf 'builds_windows=%s\n' "$builds_windows"
printf 'label=%s\n' "$label"
