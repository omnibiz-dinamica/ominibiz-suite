-- P0: fix self-referential company_id comparison in support ticket INSERT policies.
-- Bug: `t.company_id = t.company_id` is always true, allowing cross-tenant inserts.
-- Fix: compare ticket's company_id to the row's company_id (NEW row).

DROP POLICY IF EXISTS "managers insert company support_ticket_attachments" ON public.support_ticket_attachments;
CREATE POLICY "managers insert company support_ticket_attachments"
ON public.support_ticket_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  is_company_manager(auth.uid(), company_id)
  AND uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_attachments.ticket_id
      AND t.company_id = support_ticket_attachments.company_id
  )
);

DROP POLICY IF EXISTS "managers insert company support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "managers insert company support_ticket_messages"
ON public.support_ticket_messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_internal = false
  AND is_company_manager(auth.uid(), company_id)
  AND author_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.company_id = support_ticket_messages.company_id
  )
);