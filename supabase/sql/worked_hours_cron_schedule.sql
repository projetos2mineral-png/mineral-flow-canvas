-- Agendamento da importação diária de horas trabalhadas (executar UMA vez no
-- SQL Editor, depois de aplicar a migration 20261117120000_dashboard_worked_hours.sql).
--
-- Pré-requisitos:
--   1) Extensões pg_cron e pg_net habilitadas.
--   2) O mesmo valor de SYNC_CRON_SECRET configurado no app guardado no Vault
--      (reaproveita o segredo do orquestrador de sincronização):
--        select vault.create_secret('<VALOR_DO_SYNC_CRON_SECRET>', 'sync_cron_secret');
--   3) URL publicada do app (ajuste abaixo se necessário).
--
-- NÃO execute este arquivo durante o desenvolvimento: ele liga a importação
-- automática diária. A rotina também pode ser disparada manualmente pela aba
-- Capacidade (botão "Importar horas agora").

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 06:05 em America/Cuiaba (UTC-4, sem horário de verão) = 10:05 UTC.
select cron.unschedule('worked-hours-daily') where exists (select 1 from cron.job where jobname = 'worked-hours-daily');
select cron.schedule('worked-hours-daily', '5 10 * * *', $$
  select net.http_post(
    url := 'https://mineral-flow-canvas.lovable.app/api/public/worked-hours-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret')),
    body := '{"action":"daily"}'::jsonb,
    timeout_milliseconds := 60000);
$$);
