
-- 1) Add new vacation status
ALTER TYPE public.vacation_status ADD VALUE IF NOT EXISTS 'pendente_confirmacao';

-- 2) Add new notification event values
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_confirmation_required';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_confirmed';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'vacation_declined';
