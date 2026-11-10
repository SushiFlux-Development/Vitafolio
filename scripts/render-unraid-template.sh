#!/bin/sh
# Renders the Unraid Community Applications template from unraid/vitafolio.xml.template on stdout.
#
#   sh scripts/render-unraid-template.sh <image-tag> [repository-root]      image-tag: latest | beta | nightly
#
# The names (owner/repository, branch) come from branding.json, so a rename of the GitHub account is one change there. The release workflow
# and the tests use this script; the tracked unraid/vitafolio.xml is its output for "latest" (the file the Community Applications feed reads).

set -eu

version="${1:-}"
root="${2:-.}"
case "$version" in
    latest | beta | nightly) ;;
    *)
        echo "error: image tag must be latest, beta or nightly (got '$version')." >&2
        exit 1
        ;;
esac

template="$root/unraid/vitafolio.xml.template"
branding="$root/branding.json"
[ -f "$template" ] || { echo "error: $template not found." >&2; exit 1; }
[ -f "$branding" ] || { echo "error: $branding not found." >&2; exit 1; }

json_value() {
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$branding" | head -n 1
}
repository=$(json_value repository)
branch=$(json_value branch)
[ -n "$repository" ] || { echo "error: branding.json has no \"repository\"." >&2; exit 1; }
[ -n "$branch" ] || { echo "error: branding.json has no \"branch\"." >&2; exit 1; }

lower=$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')
package="${lower##*/}"
image="ghcr.io/$lower"

out=$(sed \
    -e "s|__VERSION__|$version|g" \
    -e "s|__IMAGE__|$image|g" \
    -e "s|__PACKAGE__|$package|g" \
    -e "s|__REPOSITORY__|$repository|g" \
    -e "s|__BRANCH__|$branch|g" \
    "$template")

# Every placeholder must have been replaced
if printf '%s\n' "$out" | grep -q '__[A-Z_]*__'; then
    echo "error: the rendered template still contains a placeholder." >&2
    exit 1
fi
printf '%s\n' "$out"
