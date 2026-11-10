#!/bin/sh
# The text of a GitHub release: only the entry of the tag's version from the customer changelog, first the English block, then the German one.
# The release workflow and the tests use this one script.
#
#   sh scripts/release-notes.sh <tag> [CHANGELOG.md]      (the file defaults to CHANGELOG.md in the current folder)
#
# The changelog has one block per language (<a name="english"> first, then <a name="deutsch">), each with one "## v..." entry per version.
# All headings the commit hook has written so far are found:
#   ## v2026.11.7 (0.11 α)            ## v2026.11.1 (19.31258 β)        (older form: version, counters and symbol in the parentheses)
#   ## v2026.11.12 (13.557)           (older release form)
#   ## v2026.11.12.13.557             ## v2026.11.12.13.557 (β)        ## v2026.11.12.13.557 (α)
# each with an optional " · Platform" suffix. A tag selects the channel (release / -beta / -nightly) and, for beta and nightly, the counters;
# the entry's channel and counters must agree. A missing entry in either language stops with a clear message and exit code 1 - a release
# without its notes must not go out.

set -eu

tag="${1:-}"
file="${2:-CHANGELOG.md}"

if [ -z "$tag" ]; then
    echo "usage: release-notes.sh <tag> [CHANGELOG.md]" >&2
    exit 2
fi
if [ ! -f "$file" ]; then
    echo "error: $file not found." >&2
    exit 1
fi

# Bytes, not characters: the symbols are compared as their UTF-8 bytes, whatever the locale of the runner is
LC_ALL=C awk -v tag="$tag" -v file="$file" '
function fail(message) {
    print "error: " message > "/dev/stderr"
    failed = 1
    exit 1
}

# Does this "## v..." heading belong to the tag? Same rules as ChangelogParser in the server: version, channel and (when both sides have them) counters.
function matches(heading,    rest, p, tok, tail, k, parts, core, cnt, chan, paren, q, c) {
    rest = substr(heading, 5)
    p = index(rest, " ")
    if (p == 0) { tok = rest; tail = "" } else { tok = substr(rest, 1, p - 1); tail = substr(rest, p) }
    if (tok !~ /^[0-9][0-9][0-9][0-9]\.[0-9]+\.[0-9]+(\.[0-9]+\.[0-9]+)?$/) return 0
    k = split(tok, parts, ".")
    core = parts[1] "." parts[2] "." parts[3]
    cnt = (k == 5) ? parts[4] "." parts[5] : ""
    paren = ""
    sub(/^[ \t]+/, "", tail)
    if (substr(tail, 1, 1) == "(") {
        q = index(tail, ")")
        if (q == 0) return 0
        paren = substr(tail, 2, q - 2)
        tail = substr(tail, q + 1)
    }
    sub(/^[ \t]+/, "", tail)
    sub(/[ \t]+$/, "", tail)
    if (tail != "" && index(tail, mid) != 1) return 0

    chan = "release"
    if (index(paren, beta) > 0) chan = "beta"
    else if (index(paren, alpha) > 0) chan = "nightly"
    else if (index(paren, "</>") > 0 || index(paren, "-dev") > 0) chan = "dev"
    if (cnt == "" && match(paren, /^[ \t]*[0-9]+\.[0-9]+/)) {
        c = substr(paren, RSTART, RLENGTH)
        gsub(/[ \t]/, "", c)
        cnt = c
    }
    if (core != tcore || chan != tchan) return 0
    if (cnt != "" && tcount != "" && cnt != tcount) return 0
    return 1
}

function trimmed(text) {
    sub(/^\n+/, "", text)
    sub(/\n+$/, "", text)
    return text
}

BEGIN {
    beta = "\316\262"      # U+03B2
    alpha = "\316\261"     # U+03B1
    mid = "\302\267"       # U+00B7 (the dot before a platform)

    t = tag
    sub(/^v/, "", t)
    tchan = "release"
    if (t ~ /-beta$/) { tchan = "beta"; sub(/-beta$/, "", t) }
    else if (t ~ /-(nightly|alpha)$/) { tchan = "nightly"; sub(/-(nightly|alpha)$/, "", t) }
    else if (t ~ /-rc[0-9]+$/) { tchan = "beta"; sub(/-rc[0-9]+$/, "", t) }
    n = split(t, tp, ".")
    if (n != 3 && n != 5) fail("tag " tag " is not a version tag (v2026.11.12, v2026.11.12.13.557-beta, v2026.11.12.13.557-nightly).")
    tcore = tp[1] "." tp[2] "." tp[3]
    tcount = (n == 5) ? tp[4] "." tp[5] : ""

    lang = ""
    capturing = 0
}

{
    line = $0
    sub(/\r$/, "", line)

    if (line ~ /^<a[ \t]+(name|id)="[A-Za-z]+"/) {
        name = line
        sub(/^<a[ \t]+(name|id)="/, "", name)
        sub(/".*$/, "", name)
        lang = tolower(name)
        capturing = 0
        if (lang == "english" || lang == "deutsch") seen[lang] = 1
        next
    }
    if (lang != "english" && lang != "deutsch") next

    if (capturing) {
        if (line ~ /^##[ \t]/ || line ~ /^---[ \t]*$/) capturing = 0
        else { body[lang] = body[lang] line "\n"; next }
    }
    if (!capturing && !(lang in found) && line ~ /^## v/ && matches(line)) {
        found[lang] = 1
        capturing = 1
    }
}

END {
    if (failed) exit 1
    if (!("english" in seen) || !("deutsch" in seen)) fail(file ": the changelog needs one block per language (<a name=\"english\"> and <a name=\"deutsch\">).")
    if (!("english" in found)) fail(file ": no English entry for " tag " (heading ## v... of that version and channel inside the English block).")
    if (!("deutsch" in found)) fail(file ": no German entry for " tag " (heading ## v... of that version and channel inside the German block).")
    en = trimmed(body["english"])
    de = trimmed(body["deutsch"])
    if (en == "") fail(file ": the English entry for " tag " is empty.")
    if (de == "") fail(file ": the German entry for " tag " is empty.")
    printf "## English\n\n%s\n\n## Deutsch\n\n%s\n", en, de
}
' "$file"
