
-- Extend column grants to non-financial HR config so the company settings UI
-- (approver configuration) still works for managers. Pay-rate columns remain
-- ungranted to `authenticated`; managers read them via get_company_hr_settings.
GRANT SELECT (
  company_id,
  default_punch_mode,
  employee_approver_kind,
  employee_approver_user_id,
  manager_approver_kind,
  manager_approver_user_id,
  updated_at
) ON public.company_hr_settings TO authenticated;

-- Managers also need to UPDATE/INSERT approver and punch-mode columns.
GRANT INSERT, UPDATE (
  company_id,
  default_punch_mode,
  employee_approver_kind,
  employee_approver_user_id,
  manager_approver_kind,
  manager_approver_user_id
) ON public.company_hr_settings TO authenticated;

-- Pay-rate writes also need to be possible for managers. Grant them column-level
-- INSERT/UPDATE; RLS still restricts WHICH rows they can touch
-- (is_company_manager check in the "managers manage hr settings" policy).
GRANT INSERT, UPDATE (
  default_hour_rate,
  default_fixed_rate,
  default_mixed_base_fixed,
  default_mixed_extra_hour_rate,
  default_mixed_included_minutes,
  overtime_multiplier,
  overtime_threshold_minutes,
  billing_active
) ON public.company_hr_settings TO authenticated;
