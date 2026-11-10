#!/bin/sh
# Everything the release workflow needs to know about a tag, in one place so that the workflow and its tests use the same logic.
#
#   sh scripts/release-meta.sh <tag> [repository-root]
#
# Prints one "key=value" line per fact (the format of $GITHUB_OUTPUT) and exits 0, or prints a reason to stderr and exits 1.
#
# Tags (the three channels that are built; there is no tag for a development build):
#   release  v2026.11.12                      Docker: <version> + latest + beta + nightly   GitHub: public release
#   beta     v2026.11.12.13.557-beta          Docker: <version> + beta                      GitHub: pre-release
#   nightly  v2026.11.12.13.557-nightly       Docker: <version> + nightly                   GitHub: pre-release
#
# The tag must belong to the commit it sits on: version.txt of that commit (line 1 = vYear.Month.Commit, line 2 = vYear.Month.Commit.
# Prompts.Lines) must produce exactly this tag through scripts/version-display.sh. A tag that was set on the wrong commit stops here.
#
# Keys: tag, channel (release|beta|nightly), is_prerelease, version_short, build_id, image_tag, display (the readable version, the title of
# the GitHub release), template_tag (the Docker tag the rendered Unraid template points at), repository, image, docker_tags (comma separated,
# complete image references), product, company.

set -eu

tag="${1:-}"
root="${2:-.}"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

fail() {
    echo "error: $*" >&2
    exit 1
}

[ -n "$tag" ] || fail "usage: release-meta.sh <tag> [repository-root]"

case "$tag" in
    v[0-9][0-9][0-9][0-9].*-dev) fail "Tag $tag: development builds are never tagged or published (they only run locally)." ;;
    *-rc*) fail "Tag $tag: release candidates were replaced by betas (tag v<year>.<month>.<commit>.<prompts>.<lines>-beta); this tag cannot be built any more." ;;
    *-alpha) fail "Tag $tag: nightlies are tagged -nightly (v<year>.<month>.<commit>.<prompts>.<lines>-nightly)." ;;
esac

if printf '%s\n' "$tag" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]+\.[0-9]+\.[0-9]+-beta$'; then
    channel=beta
elif printf '%s\n' "$tag" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]+\.[0-9]+\.[0-9]+-nightly$'; then
    channel=nightly
elif printf '%s\n' "$tag" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]+$'; then
    channel=release
else
    fail "Tag $tag has no valid form. Expected v2026.11.12 (release), v2026.11.12.13.557-beta or v2026.11.12.13.557-nightly."
fi

version_file="$root/version.txt"
[ -f "$version_file" ] || fail "version.txt is missing in $root."
short=$(sed -n 1p "$version_file" | tr -d '\r' | sed 's/[[:space:]]*$//')
build_id=$(sed -n 2p "$version_file" | tr -d '\r' | sed 's/[[:space:]]*$//')
printf '%s\n' "$short" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]+$' || fail "version.txt line 1 is '$short', expected vYear.Month.Commit."
[ -n "$build_id" ] || build_id="$short"

expected=$(sh "$here/version-display.sh" tag "$short" "$build_id" "$channel")
if [ "$expected" != "$tag" ]; then
    fail "Tag $tag does not match the commit it sits on: version.txt ($short / $build_id) gives $expected for the $channel channel. Tag the commit that carries this version."
fi
display=$(sh "$here/version-display.sh" display "$short" "$build_id" "$channel")

# branding.json is the only place for the names; no JSON tool is assumed on the runner, so the values are cut out with sed
branding="$root/branding.json"
[ -f "$branding" ] || fail "branding.json is missing in $root."
json_value() {
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$branding" | head -n 1
}
repository=$(json_value repository)
product=$(json_value name)
company=$(json_value company)
[ -n "$repository" ] || fail "branding.json has no \"repository\"."
[ -n "$product" ] || fail "branding.json has no \"name\"."
[ -n "$company" ] || fail "branding.json has no \"company\"."

# GHCR wants lower case
image="ghcr.io/$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')"
image_tag="${tag#v}"

case "$channel" in
    release)
        is_prerelease=false
        template_tag=latest
        docker_tags="$image:$image_tag,$image:latest,$image:beta,$image:nightly"
        ;;
    beta)
        is_prerelease=true
        template_tag=beta
        docker_tags="$image:$image_tag,$image:beta"
        ;;
    nightly)
        is_prerelease=true
        template_tag=nightly
        docker_tags="$image:$image_tag,$image:nightly"
        ;;
esac

printf 'tag=%s\n' "$tag"
printf 'channel=%s\n' "$channel"
printf 'is_prerelease=%s\n' "$is_prerelease"
printf 'version_short=%s\n' "$short"
printf 'build_id=%s\n' "$build_id"
printf 'image_tag=%s\n' "$image_tag"
printf 'display=%s\n' "$display"
printf 'template_tag=%s\n' "$template_tag"
printf 'repository=%s\n' "$repository"
printf 'image=%s\n' "$image"
printf 'docker_tags=%s\n' "$docker_tags"
printf 'product=%s\n' "$product"
printf 'company=%s\n' "$company"
