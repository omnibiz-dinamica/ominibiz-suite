-- Cleanup test data from P2 recurrence validation
DELETE FROM notifications WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM task_documents WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM tasks WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM task_recurrences WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM user_roles WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';