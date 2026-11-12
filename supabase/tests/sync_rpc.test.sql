-- Testes das RPCs de sincronização contra Postgres real (esquema stub + migration).
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

INSERT INTO runrunit_projects (runrunit_project_id, name, is_open, is_tracking_enabled, desired_delivery_date) VALUES
  (1,'P1',true,true,'2026-11-09'),(2,'P2',true,true,'2026-11-20'),(3,'P3',true,true,'2026-12-05'),
  (4,'Fora (não exibido)',true,false,'2026-11-01'),(5,'Fora (sem data)',true,true,NULL),(6,'Fora (fechado)',false,true,'2026-11-01');
INSERT INTO dashboard_lanes (id, assignee_name, title) VALUES
  ('00000000-0000-0000-0000-0000000000a1','Laura','Novembro/2026'),
  ('00000000-0000-0000-0000-0000000000a2','Laura','Dezembro/2026'),
  ('00000000-0000-0000-0000-0000000000b1','Ana','Novembro/2026');
-- Movimentações manuais existentes que NÃO podem ser alteradas:
INSERT INTO dashboard_project_cards (runrunit_project_id, assignee_name, lane_id, manually_positioned) VALUES
  (1,'Laura',NULL,true),                                      -- movida manualmente para SEM FILA
  (2,'Laura','00000000-0000-0000-0000-0000000000a2',true);    -- movida manualmente para outra fila

CREATE TEMP TABLE ctx (k text PRIMARY KEY, v jsonb);

-- T1/T2 base: aquisição cria itens segundo a regra atual de seleção.
DO $$ DECLARE r jsonb; n int; BEGIN
  r := sync_acquire_lock('automatic','cron');
  ASSERT (r->>'acquired')::boolean, 'automática deveria adquirir';
  INSERT INTO ctx VALUES ('A', r);
  SELECT count(*) INTO n FROM dashboard_sync_run_items WHERE run_id = (r->>'run_id')::uuid;
  ASSERT n = 3, format('regra de seleção: esperava 3 itens, veio %s', n);
  RAISE WARNING 'OK seleção: 3 projetos (exibidos, abertos, com data)';
END $$;

-- T2: segunda aquisição (manual) é recusada enquanto há execução ativa.
DO $$ DECLARE r jsonb; BEGIN
  r := sync_acquire_lock('manual_single','user@x',ARRAY[1]::bigint[]);
  ASSERT NOT (r->>'acquired')::boolean AND r->>'reason' = 'busy', 'manual deveria ser recusada: ' || r::text;
  r := sync_acquire_lock('manual_batch','user@x',ARRAY[1,2]::bigint[]);
  ASSERT NOT (r->>'acquired')::boolean, 'lote manual deveria ser recusado';
  BEGIN PERFORM sync_acquire_lock('manual','x',ARRAY[1]::bigint[]); ASSERT false, 'tipo inválido aceito';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  RAISE WARNING 'OK T2: manual recusada durante execução ativa; lock_type inválido rejeitado';
END $$;

-- Claim + persistência atômica + preservação manual.
DO $$ DECLARE a jsonb := (SELECT v FROM ctx WHERE k='A'); run uuid := (a->>'run_id')::uuid; tok bigint := (a->>'fencing_token')::bigint;
  it jsonb; c record; BEGIN
  it := sync_claim_next(run, tok);
  ASSERT it->>'runrunit_project_id' = '1';
  UPDATE runrunit_projects SET is_tracking_enabled = false WHERE runrunit_project_id = 1;
  PERFORM sync_persist_project(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid,
    '{"runrunit_project_id":1,"name":"P1","is_open":true,"desired_delivery_date":"2026-11-09"}',
    '[{"runrunit_task_id":11,"title":"t"}]', '[{"assignee_name":"Laura"},{"assignee_name":"Ana"}]');
  PERFORM sync_complete_item(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid);
  SELECT * INTO c FROM dashboard_project_cards WHERE runrunit_project_id=1 AND assignee_name='Laura';
  ASSERT c.lane_id IS NULL AND c.manually_positioned, 'card manual em SEM FILA foi alterado!';
  SELECT * INTO c FROM dashboard_project_cards WHERE runrunit_project_id=1 AND assignee_name='Ana';
  ASSERT c.lane_id = '00000000-0000-0000-0000-0000000000b1', 'card novo deveria ir para Novembro/2026 da Ana';
  ASSERT NOT (SELECT is_tracking_enabled FROM runrunit_projects WHERE runrunit_project_id=1),
    'sincronização reativou tracking desabilitado pelo usuário';
  RAISE WARNING 'OK manual: SEM FILA manual preservado; card novo alocado; tracking desabilitado preservado';
END $$;

-- Card em Sem fila com manually_positioned_at não pode ser realocado.
DO $$ DECLARE c record; n int; BEGIN
  INSERT INTO runrunit_projects (runrunit_project_id, name, is_open, is_tracking_enabled, desired_delivery_date)
    VALUES (7,'P7',true,true,'2026-11-09');
  INSERT INTO dashboard_project_cards (runrunit_project_id, assignee_name, lane_id, manually_positioned, manually_positioned_at)
    VALUES (7,'Ana',NULL,false,now());
  n := sync_allocate_project_cards(7);
  SELECT * INTO c FROM dashboard_project_cards WHERE runrunit_project_id=7 AND assignee_name='Ana';
  ASSERT n = 0 AND c.lane_id IS NULL AND c.manually_positioned_at IS NOT NULL,
    'card com manually_positioned_at foi realocado';
  RAISE WARNING 'OK manual: card com manually_positioned_at preservado em SEM FILA';
END $$;

-- Rollback da persistência + falha registrada em operação separada.
DO $$ DECLARE a jsonb := (SELECT v FROM ctx WHERE k='A'); run uuid := (a->>'run_id')::uuid; tok bigint := (a->>'fencing_token')::bigint;
  it jsonb; n int; st text; BEGIN
  it := sync_claim_next(run, tok);
  ASSERT it->>'runrunit_project_id' = '2';
  BEGIN
    -- runrunit_task_id inválido força erro no meio da transação (após upsert do projeto)
    PERFORM sync_persist_project(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid,
      '{"runrunit_project_id":2,"name":"P2 RENOMEADO","is_open":true,"desired_delivery_date":"2026-11-20"}',
      '[{"runrunit_task_id":"abc"}]', '[]');
    ASSERT false, 'deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'deveria%' THEN RAISE; END IF;
  END;
  SELECT name INTO st FROM runrunit_projects WHERE runrunit_project_id=2;
  ASSERT st = 'P2', 'rollback não desfez o upsert do projeto: ' || st;
  PERFORM sync_record_failure(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid, 'erro forçado');
  SELECT status INTO st FROM dashboard_sync_run_items WHERE id=(it->>'item_id')::uuid;
  ASSERT st = 'failed';
  RAISE WARNING 'OK rollback: projeto intacto após erro; falha gravada em operação separada';
END $$;

-- Backoff: item com falha não é reclamado antes do intervalo.
DO $$ DECLARE a jsonb := (SELECT v FROM ctx WHERE k='A'); run uuid := (a->>'run_id')::uuid; tok bigint := (a->>'fencing_token')::bigint;
  it jsonb; BEGIN
  it := sync_claim_next(run, tok);
  ASSERT it->>'runrunit_project_id' = '3', 'esperava P3 (P2 em backoff), veio ' || coalesce(it::text,'null');
  INSERT INTO ctx VALUES ('item3', it);
  ASSERT sync_claim_next(run, tok) IS NULL, 'P2 não deveria ser reclamado durante backoff';
  RAISE WARNING 'OK backoff: falha respeita intervalo de 30s antes de nova tentativa';
END $$;

-- T4 + T5: heartbeat vencido -> watchdog recupera; worker antigo é rejeitado.
UPDATE dashboard_sync_runs SET heartbeat_at = now() - interval '10 minutes' WHERE id = (SELECT current_run_id FROM dashboard_sync_lock);
DO $$ DECLARE a jsonb := (SELECT v FROM ctx WHERE k='A'); old_run uuid := (a->>'run_id')::uuid; old_tok bigint := (a->>'fencing_token')::bigint;
  it3 jsonb := (SELECT v FROM ctx WHERE k='item3'); r jsonb; n int; st text; att int; BEGIN
  r := sync_recover_stale();
  ASSERT (r->>'recovered')::boolean, 'watchdog deveria recuperar';
  ASSERT (r->>'fencing_token')::bigint = old_tok + 1, 'token deveria crescer';
  INSERT INTO ctx VALUES ('B', r);
  SELECT status INTO st FROM dashboard_sync_runs WHERE id = old_run;
  ASSERT st = 'abandoned', 'execução antiga deveria ficar abandoned (histórico preservado)';
  SELECT count(*) INTO n FROM dashboard_sync_run_items WHERE run_id = old_run;
  ASSERT n = 3, 'histórico da execução antiga foi perdido';
  SELECT count(*) INTO n FROM dashboard_sync_run_items WHERE run_id = (r->>'run_id')::uuid;
  ASSERT n = 2, format('filha deveria ter 2 itens (P2 failed, P3 processing->pending), veio %s', n);
  SELECT status, attempts INTO st, att FROM dashboard_sync_run_items WHERE run_id=(r->>'run_id')::uuid AND runrunit_project_id=3;
  ASSERT st = 'pending' AND att = 1, 'processing deveria virar pending herdando tentativas';
  ASSERT NOT EXISTS (SELECT 1 FROM dashboard_sync_run_items WHERE run_id=(r->>'run_id')::uuid AND runrunit_project_id=1),
    'projeto concluído não pode ser reprocessado';
  RAISE WARNING 'OK T4: watchdog abandonou execução antiga, criou filha só com pendências (processing->pending), sem concluídos';

  -- T5: worker antigo tenta gravar com token antigo.
  BEGIN
    PERFORM sync_persist_project(old_run, old_tok, (it3->>'item_id')::uuid, (it3->>'claim_id')::uuid,
      '{"runrunit_project_id":3,"name":"ZUMBI","is_open":true}', '[]', '[]');
    ASSERT false, 'zumbi gravou!';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE 'LOCK_LOST%', 'esperava LOCK_LOST, veio ' || SQLERRM;
  END;
  BEGIN PERFORM sync_record_failure(old_run, old_tok, (it3->>'item_id')::uuid, (it3->>'claim_id')::uuid, 'x'); ASSERT false;
  EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM LIKE 'LOCK_LOST%'; END;
  BEGIN PERFORM sync_heartbeat(old_run, old_tok); ASSERT false;
  EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM LIKE 'LOCK_LOST%'; END;
  SELECT name INTO st FROM runrunit_projects WHERE runrunit_project_id=3;
  ASSERT st = 'P3', 'dados alterados por worker antigo';
  RAISE WARNING 'OK T5: worker com token antigo rejeitado (persistência, falha e heartbeat); nenhum dado alterado';
END $$;

-- Limite de 3 tentativas entre execuções relacionadas + T6 isolamento + status final.
DO $$ DECLARE b jsonb := (SELECT v FROM ctx WHERE k='B'); run uuid := (b->>'run_id')::uuid; tok bigint := (b->>'fencing_token')::bigint;
  it jsonb; f jsonb; i int; st text; att int; fails int := 0; BEGIN
  FOR i IN 1..10 LOOP
    it := sync_claim_next(run, tok);
    IF it IS NULL THEN
      -- simula a passagem do tempo de backoff
      UPDATE dashboard_sync_run_items SET next_attempt_at = now() WHERE run_id = run AND status = 'failed';
      it := sync_claim_next(run, tok);
      EXIT WHEN it IS NULL;
    END IF;
    IF it->>'runrunit_project_id' = '2' THEN
      PERFORM sync_record_failure(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid, 'HTTP 404 permanente');
      fails := fails + 1;
    ELSE
      PERFORM sync_persist_project(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid,
        '{"runrunit_project_id":3,"name":"P3","is_open":true,"desired_delivery_date":"2026-12-05"}', '[]', '[{"assignee_name":"Laura"}]');
      PERFORM sync_complete_item(run, tok, (it->>'item_id')::uuid, (it->>'claim_id')::uuid);
    END IF;
  END LOOP;
  SELECT status, attempts INTO st, att FROM dashboard_sync_run_items WHERE run_id = run AND runrunit_project_id = 2;
  ASSERT st = 'failed' AND att = 3, format('P2: esperava failed/3, veio %s/%s', st, att);
  ASSERT fails = 2, format('com 1 tentativa herdada, só cabem mais 2 (vieram %s)', fails);
  SELECT status INTO st FROM dashboard_sync_run_items WHERE run_id = run AND runrunit_project_id = 3;
  ASSERT st = 'completed', 'falha do P2 não pode impedir o P3';
  ASSERT EXISTS (SELECT 1 FROM dashboard_project_cards WHERE runrunit_project_id=3 AND assignee_name='Laura'
                 AND lane_id='00000000-0000-0000-0000-0000000000a2'), 'P3 deveria ir para Dezembro/2026';
  f := sync_finalize(run, tok);
  ASSERT (f->>'done')::boolean AND f->>'status' = 'completed_with_errors', 'finalização: ' || f::text;
  ASSERT NOT (SELECT is_locked FROM dashboard_sync_lock), 'trava deveria ser liberada';
  ASSERT (SELECT failed_count FROM dashboard_sync_runs WHERE id = run) = 1;
  RAISE WARNING 'OK T6 + tentativas: P2 parou em 3 tentativas somando execuções relacionadas; P3 concluiu; completed_with_errors; trava liberada';
END $$;

-- Esgotados não voltam para pending numa nova retomada.
DO $$ DECLARE r jsonb; run uuid; tok bigint; rec jsonb; st text; BEGIN
  r := sync_acquire_lock('manual_batch','u@x',ARRAY[2,3]::bigint[]);
  run := (r->>'run_id')::uuid; tok := (r->>'fencing_token')::bigint;
  UPDATE dashboard_sync_run_items SET attempts = 3, status = 'failed' WHERE run_id = run AND runrunit_project_id = 2;
  UPDATE dashboard_sync_runs SET heartbeat_at = now() - interval '10 minutes' WHERE id = (SELECT current_run_id FROM dashboard_sync_lock);
  rec := sync_recover_stale();
  SELECT status INTO st FROM dashboard_sync_run_items WHERE run_id=(rec->>'run_id')::uuid AND runrunit_project_id=2;
  ASSERT st = 'failed', 'item esgotado voltou para ' || st;
  ASSERT (sync_claim_next((rec->>'run_id')::uuid, (rec->>'fencing_token')::bigint))->>'runrunit_project_id' = '3';
  ASSERT sync_claim_next((rec->>'run_id')::uuid, (rec->>'fencing_token')::bigint) IS NULL, 'esgotado foi reclamado';
  RAISE WARNING 'OK tentativas: item esgotado permanece failed após retomada pelo watchdog';
END $$;

-- Aquisição sobre trava vencida não inicia processo paralelo: recupera e recusa.
DO $$ DECLARE r jsonb; BEGIN
  UPDATE dashboard_sync_runs SET heartbeat_at = now() - interval '10 minutes' WHERE id = (SELECT current_run_id FROM dashboard_sync_lock);
  r := sync_acquire_lock('manual_single','u@x',ARRAY[1]::bigint[]);
  ASSERT NOT (r->>'acquired')::boolean AND r->>'reason' = 'recovering', r::text;
  RAISE WARNING 'OK: manual sobre trava vencida aciona retomada em vez de abrir execução paralela';
END $$;

-- Permissões: authenticated não executa RPCs de escrita.
DO $$ BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'sync_acquire_lock(text,text,bigint[],uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'sync_persist_project(uuid,bigint,uuid,uuid,jsonb,jsonb,jsonb)', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'sync_claim_next(uuid,bigint)', 'EXECUTE');
  RAISE WARNING 'OK segurança: RPCs de escrita só para service_role';
END $$;
