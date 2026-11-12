#!/usr/bin/env bash
# Executa os testes das RPCs num Postgres local: bash supabase/tests/run-db-tests.sh
# Requer PSQL (cliente) e um servidor em PGHOST/PGPORT/PGUSER (banco "sync_test" é recriado).
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL="${PSQL:-psql}"
DB=sync_test
$PSQL -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
$PSQL -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/stub_schema.sql -f supabase/migrations/20261110120000_resilient_sync.sql -f supabase/migrations/20261112120000_sync_tracking_manual_preservation.sql >/dev/null 2>&1
$PSQL -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/sync_rpc.test.sql 2>&1 | sed 's/^.*WARNING:  //'

# T2 (concorrência real): 8 sessões simultâneas disputam a trava; só 1 pode vencer.
$PSQL -q -d $DB -c "UPDATE dashboard_sync_lock SET is_locked=false, current_run_id=NULL"
for i in $(seq 1 8); do
  $PSQL -At -d $DB -c "SELECT (sync_acquire_lock('manual_batch','u$i',ARRAY[1,2]::bigint[]))->>'acquired'" > /tmp/sync_acq_$i.txt &
done
wait
WINS=$(cat /tmp/sync_acq_*.txt | grep -c true || true)
rm -f /tmp/sync_acq_*.txt
if [ "$WINS" != "1" ]; then echo "FALHA T2: $WINS sessões adquiriram a trava"; exit 1; fi
echo "OK T2 (concorrência real): 8 aquisições simultâneas, exatamente 1 venceu"

# Dois workers simultâneos nunca reservam o mesmo projeto (SKIP LOCKED).
read RUN TOK < <($PSQL -At -F' ' -d $DB -c "SELECT current_run_id, fencing_token FROM dashboard_sync_lock")
for i in 1 2; do
  $PSQL -At -d $DB -c "SELECT (sync_claim_next('$RUN',$TOK))->>'runrunit_project_id'" > /tmp/sync_claim_$i.txt &
done
wait
A=$(cat /tmp/sync_claim_1.txt); B=$(cat /tmp/sync_claim_2.txt); rm -f /tmp/sync_claim_*.txt
if [ -z "$A" ] || [ -z "$B" ] || [ "$A" = "$B" ]; then echo "FALHA: workers reservaram '$A' e '$B'"; exit 1; fi
echo "OK workers: reservas simultâneas pegaram projetos distintos ($A e $B)"
echo "TODOS OS TESTES DE BANCO PASSARAM"
