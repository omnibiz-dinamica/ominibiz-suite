DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.timesheet_operational_list(uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,date,date,integer,integer)'::regprocedure);
  IF position('FROM page)' IN v_def) = 0 THEN
    RAISE NOTICE 'timesheet_operational_list already aliased or pattern not found; skipping';
    RETURN;
  END IF;
  v_def := replace(v_def, 'FROM page)', 'FROM page AS x)');
  EXECUTE v_def;
END;
$$;