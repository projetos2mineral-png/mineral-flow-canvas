CREATE OR REPLACE FUNCTION public.dashboard_month_title_to_date(p_title text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
  v_month text;
  v_year integer;
  v_month_number integer;
BEGIN
  v := translate(
    coalesce(p_title, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
  );
  v := btrim(regexp_replace(v, '[[:space:]/_.-]+', ' ', 'g'));
  v := lower(v);

  IF v !~ '^[a-z]+ [0-9]{4}$' THEN
    RETURN NULL;
  END IF;

  v_month := split_part(v, ' ', 1);
  v_year := split_part(v, ' ', 2)::integer;

  IF v_year < 1900 OR v_year > 2200 THEN
    RETURN NULL;
  END IF;

  v_month_number := CASE v_month
    WHEN 'janeiro' THEN 1
    WHEN 'fevereiro' THEN 2
    WHEN 'marco' THEN 3
    WHEN 'abril' THEN 4
    WHEN 'maio' THEN 5
    WHEN 'junho' THEN 6
    WHEN 'julho' THEN 7
    WHEN 'agosto' THEN 8
    WHEN 'setembro' THEN 9
    WHEN 'outubro' THEN 10
    WHEN 'novembro' THEN 11
    WHEN 'dezembro' THEN 12
    ELSE NULL
  END;

  IF v_month_number IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN make_date(v_year, v_month_number, 1);
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

ALTER TABLE public.dashboard_lanes
  ADD COLUMN IF NOT EXISTS reference_month date;

UPDATE public.dashboard_lanes
SET reference_month = public.dashboard_month_title_to_date(title);

DO $$
DECLARE
  conflict_assignee text;
  conflict_month date;
  conflict_count integer;
  conflict_titles text;
BEGIN
  SELECT
    assignee_name,
    reference_month,
    count(*)::integer,
    string_agg(title, ' | ' ORDER BY title)
  INTO conflict_assignee, conflict_month, conflict_count, conflict_titles
  FROM public.dashboard_lanes
  WHERE reference_month IS NOT NULL
  GROUP BY assignee_name, reference_month
  HAVING count(*) > 1
  ORDER BY count(*) DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Filas mensais duplicadas para o responsável % em %: % (%)',
      conflict_assignee,
      conflict_month,
      conflict_titles,
      conflict_count;
  END IF;
END;
$$;

ALTER TABLE public.dashboard_lanes
  DROP CONSTRAINT IF EXISTS dashboard_lanes_reference_month_first_day;

ALTER TABLE public.dashboard_lanes
  ADD CONSTRAINT dashboard_lanes_reference_month_first_day
  CHECK (
    reference_month IS NULL
    OR reference_month = date_trunc('month', reference_month)::date
  );

CREATE OR REPLACE FUNCTION public.dashboard_lanes_sync_reference_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.reference_month := public.dashboard_month_title_to_date(NEW.title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dashboard_lanes_sync_reference_month
  ON public.dashboard_lanes;

CREATE TRIGGER dashboard_lanes_sync_reference_month
BEFORE INSERT OR UPDATE OF title
ON public.dashboard_lanes
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_lanes_sync_reference_month();

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_lanes_assignee_reference_month_key
  ON public.dashboard_lanes (assignee_name, reference_month)
  WHERE reference_month IS NOT NULL;

REVOKE ALL ON FUNCTION public.dashboard_month_title_to_date(text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dashboard_lanes_sync_reference_month()
  FROM PUBLIC, anon, authenticated;
