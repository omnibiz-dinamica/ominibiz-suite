REVOKE ALL ON FUNCTION public.timesheet_versions_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.timesheet_versions_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.timesheet_versions_append_only() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.timesheet_versions_append_only() TO service_role;