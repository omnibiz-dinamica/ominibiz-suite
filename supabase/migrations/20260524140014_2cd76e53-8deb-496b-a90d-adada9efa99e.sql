-- ============================================================
-- WARNING 1: profiles — usar membership real via user_roles
-- ============================================================
DROP POLICY IF EXISTS "managers view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "managers update company profiles" ON public.profiles;

CREATE POLICY "managers view company profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.user_roles ur_target
      JOIN public.user_roles ur_caller
        ON ur_caller.company_id = ur_target.company_id
     WHERE ur_target.user_id = profiles.id
       AND ur_caller.user_id = auth.uid()
       AND ur_caller.role IN ('manager','owner')
       AND ur_target.company_id IS NOT NULL
  )
);

CREATE POLICY "managers update company profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.user_roles ur_target
      JOIN public.user_roles ur_caller
        ON ur_caller.company_id = ur_target.company_id
     WHERE ur_target.user_id = profiles.id
       AND ur_caller.user_id = auth.uid()
       AND ur_caller.role IN ('manager','owner')
       AND ur_target.company_id IS NOT NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.user_roles ur_target
      JOIN public.user_roles ur_caller
        ON ur_caller.company_id = ur_target.company_id
     WHERE ur_target.user_id = profiles.id
       AND ur_caller.user_id = auth.uid()
       AND ur_caller.role IN ('manager','owner')
       AND ur_target.company_id IS NOT NULL
  )
);

-- ============================================================
-- WARNING 2: vacation_requests — aprovação só via RPC
-- ============================================================
-- Remove UPDATE direto do aprovador
DROP POLICY IF EXISTS "approver updates assigned vacations" ON public.vacation_requests;
-- Remove UPDATE livre de manager (manager continua podendo via vacation_decide RPC, que é SECURITY DEFINER)
DROP POLICY IF EXISTS "managers manage company vacations" ON public.vacation_requests;

-- Mantidas (já existem):
--   * "users cancel own pending vacations" — só seta status='cancelado' e bloqueia decided_*
--   * "super admin all vacations"
--   * "approver views assigned vacations" / "managers view company vacations" / "users view own vacations"
--   * "users create own vacations"
-- Resultado: status/decided_by/decided_at/decision_reason só são alteráveis via vacation_decide().