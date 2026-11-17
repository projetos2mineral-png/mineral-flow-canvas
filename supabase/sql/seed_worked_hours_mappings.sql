-- Vínculos iniciais entre responsáveis da Central e IDs oficiais do Runrun.it.
-- Fonte dos IDs: diagnóstico read-only (GET /api/v1.0/users + responsáveis das
-- tarefas no banco). O ID oficial é o campo `id` da API, não `alt_id`; ele não
-- corresponde necessariamente ao nome exibido.
--
-- Idempotente: insere apenas quando não existe vínculo equivalente por nome da
-- Central OU por ID do Runrun.it. Execute UMA vez após aplicar a migration
-- 20261117120000_dashboard_worked_hours.sql. Não é executado pelo app.

INSERT INTO public.dashboard_user_runrunit_mapping
  (user_name, runrunit_user_id, runrunit_user_name)
SELECT v.user_name, v.runrunit_user_id, v.runrunit_user_name
FROM (VALUES
  ('Alessandra Protzner',        'alessandra-protzner',        'Alessandra Protzner'),
  ('Caio',                       'natalia',                   'Caio'),
  ('Camila Pimentel de Carvalho','camila-pimentel-de-carvalho','Camila Pimentel de Carvalho'),
  ('Caroline',                   'felipe-chandelier',         'Caroline'),
  ('Emanuele',                   'temporario',                'Emanuele'),
  ('Gabriel Carvalho',           'daniele-mathias',           'Gabriel Carvalho'),
  ('Jessica França',             'jessica-franca',            'Jessica França'),
  ('João',                       'joao',                      'João'),
  ('Laura Fernandes',            'laura-fernandes',           'Laura Fernandes'),
  ('Matheus Ivankio dos Santos', 'estagiario',                'Matheus Ivankio dos Santos'),
  ('Matheus Moraes Fernandes',   'matheus-moraes-fernandes',  'Matheus Moraes Fernandes'),
  ('Sidcley Souza',              'sydney-de-souza',           'Sidcley Souza'),
  ('Thyago Gonçalves',           'thyago-goncalves',          'Geoprocessamento')
) AS v(user_name, runrunit_user_id, runrunit_user_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_user_runrunit_mapping m
  WHERE m.user_name = v.user_name
     OR m.runrunit_user_id = v.runrunit_user_id
);
