-- REVERSÃO (NÃO EXECUTAR sem autorização) — restaura o estado de 08/10/2026 antes do ajuste.
-- Obs.: gatilhos touch_updated_at sobrescrevem updated_at no UPDATE; os demais campos voltam exatos.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

UPDATE public.task_recurrences SET duration_minutes = 33360, updated_at = '2026-10-06 15:50:37.299616+00' WHERE id = '701b5ac0-c01d-4ade-8f82-66e6c913c994';
UPDATE public.tasks SET scheduled_end = '2026-10-31 19:30:00+00', due_at = '2026-10-31 19:30:00+00', updated_at = '2026-10-08 13:18:18.608678+00' WHERE id = 'da872e02-3ed1-440a-af44-0ebadf9cf18b';
UPDATE public.tasks SET scheduled_end = '2026-11-01 19:30:00+00', due_at = '2026-11-01 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = 'c9042d05-4c86-422e-8e55-9048c6821989';
UPDATE public.tasks SET scheduled_end = '2026-11-04 19:30:00+00', due_at = '2026-11-04 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '40c7b4e7-c731-4084-839a-32288338c07b';
UPDATE public.tasks SET scheduled_end = '2026-11-05 19:30:00+00', due_at = '2026-11-05 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '818541f3-3edd-4322-ab19-f7315cb55271';
UPDATE public.tasks SET scheduled_end = '2026-11-06 19:30:00+00', due_at = '2026-11-06 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '1981b09d-28f3-44ad-88a2-275dcc46d057';
UPDATE public.tasks SET scheduled_end = '2026-11-07 19:30:00+00', due_at = '2026-11-07 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '12d0325c-81f5-4565-affb-48b70134d43d';
UPDATE public.tasks SET scheduled_end = '2026-11-08 19:30:00+00', due_at = '2026-11-08 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '33adce9d-abf2-40b8-8d90-12c81fc4259c';
UPDATE public.tasks SET scheduled_end = '2026-11-11 19:30:00+00', due_at = '2026-11-11 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '43b67985-3c3b-44ac-b0ca-929dc2274840';
UPDATE public.tasks SET scheduled_end = '2026-11-12 19:30:00+00', due_at = '2026-11-12 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = 'eebec352-2d70-48e8-99ad-6896457b995c';
UPDATE public.tasks SET scheduled_end = '2026-11-13 19:30:00+00', due_at = '2026-11-13 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '6fd9e842-d79b-4835-ba78-bf31b74e6574';
UPDATE public.tasks SET scheduled_end = '2026-11-14 19:30:00+00', due_at = '2026-11-14 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = 'ed6b0a45-0e7d-4c74-b82a-ad6b259fd76a';
UPDATE public.tasks SET scheduled_end = '2026-11-15 19:30:00+00', due_at = '2026-11-15 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '5abb3ba5-4274-4cff-b97a-c7287a326a4f';
UPDATE public.tasks SET scheduled_end = '2026-11-18 19:30:00+00', due_at = '2026-11-18 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '1c5b73f7-377b-46c7-ab12-2f2e7b57c3db';
UPDATE public.tasks SET scheduled_end = '2026-11-19 19:30:00+00', due_at = '2026-11-19 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '031aeef0-9b44-4a0b-a16a-e00f31543703';
UPDATE public.tasks SET scheduled_end = '2026-11-20 19:30:00+00', due_at = '2026-11-20 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = 'f7548291-ead0-46af-abb8-796b9549c019';
UPDATE public.tasks SET scheduled_end = '2026-11-21 19:30:00+00', due_at = '2026-11-21 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = '89cdec31-a792-4690-bc9b-4e42e6b99604';
UPDATE public.tasks SET scheduled_end = '2026-11-22 19:30:00+00', due_at = '2026-11-22 19:30:00+00', updated_at = '2026-10-06 15:50:37.565963+00' WHERE id = 'e5138be9-bbc1-45c2-869c-b6ed7a560033';
