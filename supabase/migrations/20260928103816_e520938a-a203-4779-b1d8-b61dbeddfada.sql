UPDATE public.tasks t
SET schedule_name = r.schedule_name
FROM public.task_recurrences r
WHERE t.recurrence_id = r.id
  AND t.schedule_name IS NULL
  AND r.schedule_name IS NOT NULL;

UPDATE public.tasks t
SET schedule_name = g.schedule_name
FROM (
  SELECT DISTINCT ON (task_group_id) task_group_id, schedule_name
  FROM public.tasks
  WHERE task_group_id IS NOT NULL AND schedule_name IS NOT NULL
  ORDER BY task_group_id, created_at
) g
WHERE t.task_group_id = g.task_group_id
  AND t.schedule_name IS NULL;