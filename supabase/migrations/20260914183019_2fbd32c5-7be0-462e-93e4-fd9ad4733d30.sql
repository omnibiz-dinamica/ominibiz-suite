DO $$
DECLARE
  v_recurrence_id uuid;
BEGIN
  FOR v_recurrence_id IN
    SELECT id
    FROM public.task_recurrences
    WHERE id IN (
      '2f853989-e304-4cbc-9049-691e02c8656f'::uuid,
      'c38a0bba-52a0-4c0c-a7e0-b18eeb0b0647'::uuid,
      'dde3dea5-ded9-4f7a-a432-c19091c23f0a'::uuid
    )
      AND company_id = '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'::uuid
      AND status = 'active'
    ORDER BY id
  LOOP
    PERFORM public.recurrence_materialize(
      60,
      '7b79e6a5-5b78-4a34-ae0a-b5808c724e6c'::uuid,
      v_recurrence_id
    );
  END LOOP;
END;
$$;