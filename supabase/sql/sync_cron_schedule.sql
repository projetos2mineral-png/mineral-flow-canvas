-- Agendamentos da sincronização resiliente (executar UMA vez no SQL Editor,
-- depois de aplicar a migration 20261110120000_resilient_sync.sql).
--
-- Pré-requisitos:
--   1) Extensões pg_cron e pg_net habilitadas (Database > Extensions).
--   2) O mesmo valor de SYNC_CRON_SECRET configurado no app guardado no Vault:
--        select vault.create_secret('<VALOR_DO_SYNC_CRON_SECRET>', 'sync_cron_secret');
--   3) URL publicada do app (abaixo: https://mineral-flow-canvas.lovable.app).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 06:00 em America/Cuiaba (UTC-4, sem horário de verão) = 10:00 UTC.
select cron.unschedule('sync-runrunit-daily') where exists (select 1 from cron.job where jobname = 'sync-runrunit-daily');
select cron.schedule('sync-runrunit-daily', '0 10 * * *', $$
  select net.http_post(
    url := 'https://mineral-flow-canvas.lovable.app/api/public/sync-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret')),
    body := '{"action":"daily"}'::jsonb,
    timeout_milliseconds := 60000);
$$);

-- Watchdog: a cada minuto retoma execução sem heartbeat ou continua a próxima fatia.
select cron.unschedule('sync-runrunit-watchdog') where exists (select 1 from cron.job where jobname = 'sync-runrunit-watchdog');
select cron.schedule('sync-runrunit-watchdog', '* * * * *', $$
  select net.http_post(
    url := 'https://mineral-flow-canvas.lovable.app/api/public/sync-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret')),
    body := '{"action":"watchdog"}'::jsonb,
    timeout_milliseconds := 60000);
$$);
