
- All NEW employee assignment pickers use server-filtered `company_active_member_options`; inactivity is global (`is_active`, `status`, effective `termination_date`), while historical records retain names.
- Client location saves use the browser-safe location resolver and await address geocoding; manual coordinate edits and their reverse-geocoded addresses are confirmed together, while radius-only edits are not, to preserve exact pins without accepting stale locations.
- Keep the punch editor session keyed by user, company, mode and target identity so restored pauses and pending draft writes cannot cross records.
