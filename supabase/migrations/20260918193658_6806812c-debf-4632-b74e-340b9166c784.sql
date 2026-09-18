DELETE FROM public.notifications WHERE metadata->>'vacation_id' = '1ac3216d-9ba2-46f3-af26-742d126963c1';
DELETE FROM public.vacation_audit WHERE vacation_request_id = '1ac3216d-9ba2-46f3-af26-742d126963c1';
DELETE FROM public.vacation_requests WHERE id = '1ac3216d-9ba2-46f3-af26-742d126963c1';