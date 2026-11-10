#!/bin/sh
# How the app version is written for people and for tags. Used by the pre-commit hook (changelog heading) and by the release workflow
# (GitHub release title); the server's version helper must produce the same text - keep both in step.
#
#   sh scripts/version-display.sh display <short> <buildId> <release|beta|nightly|dev>
#   sh scripts/version-display.sh tag     <short> <buildId> <release|beta|nightly|dev>
#
# short = line 1 of version.txt (v2026.11.12), buildId = line 2 (v2026.11.12.13.557, may be empty).
#   display: all five segments, the channel symbol in parentheses behind them: release "v2026.11.12.13.557", beta "v2026.11.12.13.557 (β)",
#            nightly "v2026.11.12.13.557 (α)", dev "v2026.11.10.13.557 (</>)". Without counters the short version plus symbol - never empty parentheses.
#   tag:     release "v2026.11.12", beta "v2026.11.12.13.557-beta", nightly "v2026.11.12.13.557-nightly"; dev has no tag of its own, it prints the plain
#            build id (no spaces, parentheses or β: usable as git/Docker tag and file name).

set -e

mode="${1:-}"
short="${2:-}"
build="${3:-}"
kind="${4:-release}"

if [ -z "$short" ] || { [ "$mode" != "display" ] && [ "$mode" != "tag" ]; }; then
    echo "usage: version-display.sh display|tag <short> <buildId> <release|beta|nightly|dev>" >&2
    exit 2
fi

# U+03B2 (β) and U+03B1 (α) written as their UTF-8 bytes, so the result never depends on the encoding of this file or on the locale
beta_mark=$(printf '\316\262')
nightly_mark=$(printf '\316\261')

# "prompts.lines" from the build id: it must be <short>.<digits>.<digits>
counters=""
case "$build" in
    "$short".*)
        rest="${build#"$short".}"
        case "$rest" in
            "" | *[!0-9.]* | .* | *. | *..* | *.*.*) ;;
            *.*) counters="$rest" ;;
        esac
        ;;
esac

full="$short"
[ -z "$counters" ] || full="$short.$counters"

if [ "$mode" = "tag" ]; then
    case "$kind" in
        beta) printf '%s-beta\n' "$full" ;;
        nightly|alpha) printf '%s-nightly\n' "$full" ;;
        dev) printf '%s\n' "$full" ;;
        *) printf '%s\n' "$short" ;;
    esac
    exit 0
fi

case "$kind" in
    beta) printf '%s (%s)\n' "$full" "$beta_mark" ;;
    nightly|alpha) printf '%s (%s)\n' "$full" "$nightly_mark" ;;
    dev) printf '%s (</>)\n' "$full" ;;
    *) printf '%s\n' "$full" ;;
esac
