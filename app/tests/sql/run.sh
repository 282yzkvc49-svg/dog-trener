#!/usr/bin/env bash
# Проверка SQL общей собаки на локальном PostgreSQL 16.
# Если рядом лежит миграция «Бережно» (WIFE_SQL), она применяется первой — проверяем, что объекты не конфликтуют.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
chmod 777 "$WORK"
PORT="${PGPORT_TEST:-54331}"
AS="runuser -u postgres --"
[ "$(id -u)" = "0" ] || AS=""
$AS "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
$AS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
trap '$AS "$PGBIN/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true' EXIT
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"
$PSQL -d postgres -c "create database aussie_test" >/dev/null
$PSQL -d aussie_test -f "$HERE/stub.sql"
if [ -n "${WIFE_SQL:-}" ] && [ -f "$WIFE_SQL" ]; then
  $PSQL -d aussie_test -f "$WIFE_SQL" >/dev/null
  echo "миграция «Бережно» применена"
fi
$PSQL -d aussie_test -f "$ROOT/supabase/aussie_trainer.sql"
echo "aussie_trainer.sql применён (1-й раз)"
$PSQL -d aussie_test -f "$ROOT/supabase/aussie_trainer.sql"
echo "aussie_trainer.sql применён повторно — идемпотентен"
$PSQL -d aussie_test -f "$HERE/test_aussie.sql"
if [ -n "${WIFE_SQL:-}" ] && [ -f "$WIFE_SQL" ]; then
  $PSQL -d aussie_test -c "select count(*) as berezhno_functions from pg_proc where proname in ('push_changes','pull_changes','delete_my_data')" 
fi
echo "SQL: все проверки пройдены"
