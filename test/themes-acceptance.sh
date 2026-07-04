#!/usr/bin/env bash
# Themes-model whole-stack acceptance (Plan 1 / Task 12).
# Flow: up --wait -> login -> GET /api/themes (Default, isLive) -> save-draft a hero edit
# (one revision bump) -> preview shows it (published web does NOT yet) -> publish Default ->
# web serves it -> duplicate "Copy" -> save-draft a DIFFERENT hero edit on Copy -> publish Copy
# -> web flips to Copy -> Default's draft is unchanged -> DELETE the live theme => 409 LIVE_THEME.
# Cleanup (restores a re-runnable state): re-publish Default (live again) -> DELETE Copy (200,
# proves a non-live theme deletes) -> web back to the Default sentinel.
#
# Any failure exits non-zero. Re-runnable: never hardcodes a revision (always re-reads), and
# leaves Default live at the end.
#
# Env overrides (defaults match docker-compose):
#   API_BASE  WEB_BASE  SEED_ADMIN_USERNAME  SEED_ADMIN_PASSWORD  PREVIEW_SECRET

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"

envval() { [ -f .env ] && grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true; }
API="${API_BASE:-http://localhost:3060}"
WEB="${WEB_BASE:-http://localhost:3062}"
ADMIN_USERNAME="${SEED_ADMIN_USERNAME:-$(envval SEED_ADMIN_USERNAME)}"; ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${SEED_ADMIN_PASSWORD:-$(envval SEED_ADMIN_PASSWORD)}"; ADMIN_PASS="${ADMIN_PASS:-change-me-please-now}"
PREVIEW_SECRET="${PREVIEW_SECRET:-$(envval PREVIEW_SECRET)}"; PREVIEW_SECRET="${PREVIEW_SECRET:-dev-preview-secret-change-me}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

say()  { printf '\n=== %s ===\n' "$1"; }
fail() { printf 'ACCEPTANCE FAIL: %s\n' "$1" >&2; exit 1; }

# GET /api/themes -> jq over the array. $1 = jq filter (array in scope as the input).
themes() { curl -sS -b "$JAR" "$API/api/themes"; }
# preview draftSnapshot for a theme id -> hero.titleTop.vi
hero_vi() { curl -sS -H "x-preview-secret: $PREVIEW_SECRET" -X POST "$API/api/preview/snapshot?themeId=$1" | jq -r '.blocks.hero.titleTop.vi'; }
# full hero block (draftSnapshot) for a theme id
hero_block() { curl -sS -H "x-preview-secret: $PREVIEW_SECRET" -X POST "$API/api/preview/snapshot?themeId=$1" | jq -c '.blocks.hero'; }
draft_rev() { themes | jq -r --arg id "$1" '.[]|select(.id==$id)|.draftRevision'; }
is_live()   { themes | jq -r --arg id "$1" '.[]|select(.id==$id)|.isLive'; }

# save-draft a hero edit. $1=themeId $2=sentinel ; bumps revision once. Echoes the new draftRevision.
save_hero() {
  local id="$1" v="$2" rev hero data code
  rev="$(draft_rev "$id")"
  hero="$(hero_block "$id")"
  data="$(printf '%s' "$hero" | jq -c --arg v "$v" '.titleTop.vi=$v | .titleTop.en=$v')"
  code="$(curl -sS -o /tmp/sd.out -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"edits\":[{\"key\":\"hero\",\"data\":$data}],\"expectedDraftRevision\":$rev}" \
    "$API/api/themes/$id/save-draft")"
  { [ "$code" = "200" ] || [ "$code" = "201" ]; } || fail "save-draft($id) returned $code: $(cat /tmp/sd.out)"
  draft_rev "$id"
}
# publish a theme. $1=themeId ; reads its current draftRevision. Echoes the published version.
publish() {
  local id="$1" rev resp status ver
  rev="$(draft_rev "$id")"
  resp="$(curl -sS -b "$JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"themeId\":\"$id\",\"expectedDraftRevision\":$rev,\"note\":\"themes-acceptance\"}" \
    "$API/api/releases/publish")"
  status="$(printf '%s' "$resp" | jq -r '.status')"
  ver="$(printf '%s' "$resp" | jq -r '.version // empty')"
  [ "$status" = "published" ] || fail "publish($id) status=$status (resp: $resp)"
  [ -n "$ver" ] || fail "publish($id) returned no version (resp: $resp)"
  printf '%s' "$ver"
}
# does the web /vi HTML currently contain $1 ? (here-string, no pipe → no curl SIGPIPE noise)
web_has() { local h; h="$(curl -sS "$WEB/vi")"; grep -qF -- "$1" <<<"$h"; }
# poll the web until /vi contains $1 (or fail after 40s)
web_shows() {
  local want="$1" _; for _ in $(seq 1 20); do
    if web_has "$want"; then return 0; fi
    sleep 2
  done
  fail "web /vi never showed '$want' after 40s (revalidation broken?)"
}

say "0. (re)start api + web on the freshly built images; wait healthy"
docker compose up -d --wait api web || fail "compose did not reach healthy"
docker compose exec -T api node apps/api/dist/main seed >/dev/null 2>&1 || true  # idempotent no-op (Theme exists)

say "1. login -> sx_session + ADMIN"
code="$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASS\"}" "$API/api/auth/login")"
{ [ "$code" = "200" ] || [ "$code" = "201" ]; } || fail "login returned $code"
grep -q 'sx_session' "$JAR" || fail "no sx_session cookie"
[ "$(curl -sS -b "$JAR" "$API/api/auth/me" | jq -r '.user.role')" = "ADMIN" ] || fail "not ADMIN"

say "2. GET /api/themes -> Default present and isLive"
DEFAULT_ID="$(themes | jq -r '.[]|select(.name=="Default")|.id')"
[ -n "$DEFAULT_ID" ] && [ "$DEFAULT_ID" != "null" ] || fail "no Default theme"
[ "$(is_live "$DEFAULT_ID")" = "true" ] || fail "Default is not live at start (re-run cleanup may have failed)"

say "3. save-draft a hero edit on Default (one revision bump)"
SENT_A="ACCEPT-DEFAULT-$(date +%s)"
# Capture the original hero so cleanup can restore it — acceptance must not leave a
# sentinel as the live hero title.
ORIG_HERO="$(hero_block "$DEFAULT_ID")"
ORIG_VI="$(printf '%s' "$ORIG_HERO" | jq -r '.titleTop.vi')"
REV_BEFORE="$(draft_rev "$DEFAULT_ID")"
REV_AFTER="$(save_hero "$DEFAULT_ID" "$SENT_A")"
[ "$REV_AFTER" = "$((REV_BEFORE + 1))" ] || fail "draftRevision did not bump by 1 ($REV_BEFORE -> $REV_AFTER)"

say "4. preview shows the edit; published web does NOT yet"
[ "$(hero_vi "$DEFAULT_ID")" = "$SENT_A" ] || fail "preview did not show '$SENT_A'"
! web_has "$SENT_A" || fail "web already shows '$SENT_A' before publish"

say "5. publish Default -> web serves it"
V_DEF="$(publish "$DEFAULT_ID")"; printf 'published Default as v%s\n' "$V_DEF"
web_shows "$SENT_A"

say "6. duplicate Default -> Copy"
COPY_NAME="Copy-$(date +%s)"
COPY_ID="$(curl -sS -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"$COPY_NAME\"}" "$API/api/themes/$DEFAULT_ID/duplicate" | jq -r '.id')"
[ -n "$COPY_ID" ] && [ "$COPY_ID" != "null" ] || fail "duplicate did not return an id"

say "7. save-draft a DIFFERENT hero edit on Copy, publish Copy -> web flips to Copy"
SENT_B="ACCEPT-COPY-$(date +%s)"
save_hero "$COPY_ID" "$SENT_B" >/dev/null
V_COPY="$(publish "$COPY_ID")"; printf 'published Copy as v%s\n' "$V_COPY"
web_shows "$SENT_B"
! web_has "$SENT_A" || fail "web still shows Default's '$SENT_A' after Copy publish"

say "8. Default's draft is unchanged (still '$SENT_A')"
[ "$(hero_vi "$DEFAULT_ID")" = "$SENT_A" ] || fail "Default draft changed (expected '$SENT_A')"

say "9. DELETE the live theme (Copy) => 409 LIVE_THEME"
del_code="$(curl -sS -o /tmp/del.out -w '%{http_code}' -b "$JAR" -X DELETE "$API/api/themes/$COPY_ID")"
[ "$del_code" = "409" ] || fail "DELETE live theme returned $del_code (expected 409): $(cat /tmp/del.out)"
grep -q 'LIVE_THEME' /tmp/del.out || fail "409 body did not contain LIVE_THEME: $(cat /tmp/del.out)"

say "10. CLEANUP: restore Default's original hero, re-publish (live again) -> DELETE Copy (200) -> web reverts"
RREV="$(draft_rev "$DEFAULT_ID")"
rc="$(curl -sS -o /tmp/sd.out -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"edits\":[{\"key\":\"hero\",\"data\":$ORIG_HERO}],\"expectedDraftRevision\":$RREV}" \
  "$API/api/themes/$DEFAULT_ID/save-draft")"
{ [ "$rc" = "200" ] || [ "$rc" = "201" ]; } || fail "restore save-draft returned $rc: $(cat /tmp/sd.out)"
publish "$DEFAULT_ID" >/dev/null
del_code="$(curl -sS -o /tmp/del.out -w '%{http_code}' -b "$JAR" -X DELETE "$API/api/themes/$COPY_ID")"
{ [ "$del_code" = "200" ] || [ "$del_code" = "204" ]; } || fail "DELETE non-live Copy returned $del_code: $(cat /tmp/del.out)"
web_shows "$ORIG_VI"

printf '\nACCEPTANCE PASS: themes -> save-draft -> preview -> publish -> web -> duplicate -> publish -> flip -> isolation -> delete-live(409) -> cleanup\n'
