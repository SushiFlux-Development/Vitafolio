#!/bin/sh
# Container entrypoint. The container starts as root only to hand the data folder to the configured user, then runs the app without
# root rights (setpriv). PUID/PGID default to Unraid's nobody:users (99:100), the owner Unraid gives a new appdata folder; other hosts
# set their own. Started with --user (not root), it simply runs the app as that user.
# umask 077: the database, its write-ahead log, the keys and the backups are readable by the app user only (files 600, folders 700).
# Temporary files: the root file system is read-only and /tmp is a small RAM disk (64 MB), so uploads and the working copies of backups would
# fill it. The app gets a temp folder inside the data folder instead (ASPNETCORE_TEMP for buffered uploads, TMPDIR for everything else); it
# is emptied at every start, because nothing in it is worth keeping after a crash.
set -eu
umask 077

data_dir="${DATA_DIR:-/data}"
app="/app/Cv.Server.dll"
temp_dir="$data_dir/tmp"

# Empties the temp folder (leftovers of an interrupted upload or backup) and points the app at it; without write access it stays on /tmp
use_data_temp() {
    if mkdir -p "$temp_dir" 2>/dev/null && [ -w "$temp_dir" ]; then
        find "$temp_dir" -mindepth 1 -delete 2>/dev/null || true
        export ASPNETCORE_TEMP="$temp_dir" TMPDIR="$temp_dir"
    fi
}

if [ "$(id -u)" != "0" ]; then
    use_data_temp
    exec dotnet "$app" "$@"
fi

puid="${PUID:-99}"
pgid="${PGID:-100}"
case "$puid" in ''|*[!0-9]*) echo "PUID muss eine Zahl sein (ist: '$puid')." >&2; exit 1 ;; esac
case "$pgid" in ''|*[!0-9]*) echo "PGID muss eine Zahl sein (ist: '$pgid')." >&2; exit 1 ;; esac
if [ "$pgid" = "0" ]; then
    echo "PGID=0 (root-Gruppe) ist nicht erlaubt: die Anwendung laeuft nie mit Root-Rechten. Bitte eine normale Gruppen-ID setzen (Unraid: 100)." >&2
    exit 1
fi
if [ "$puid" = "0" ]; then
    echo "PUID=0 (root) ist nicht erlaubt: die Anwendung laeuft nie mit Root-Rechten. Bitte eine normale Benutzer-ID setzen (Unraid: 99)." >&2
    exit 1
fi

mkdir -p "$data_dir"
# The backup folder may be mounted separately (BACKUP_DIR); it gets the same owner
backup_dir="${BACKUP_DIR:-}"
if [ -n "$backup_dir" ]; then mkdir -p "$backup_dir"; fi

# The temp folder exists before the ownership pass below, so it is handed to the app user together with the rest of the data folder
use_data_temp

# Only what does not belong to the user yet - a full chown on every start would be slow on a big folder
for dir in "$data_dir" "$backup_dir"; do
    [ -n "$dir" ] || continue
    find "$dir" \( ! -user "$puid" -o ! -group "$pgid" \) -exec chown -h "$puid:$pgid" {} +
    # Data written by earlier versions may be readable by group and others: tighten it (only what is not private yet)
    find "$dir" -perm /077 -exec chmod go-rwx {} +
done

export HOME=/tmp
exec setpriv --reuid="$puid" --regid="$pgid" --clear-groups --no-new-privs -- dotnet "$app" "$@"
