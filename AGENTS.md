
- All NEW employee assignment pickers use server-filtered `company_active_member_options`; inactivity is global (`is_active`, `status`, effective `termination_date`), while historical records retain names.
- Client location saves use the browser-safe location resolver and await address geocoding; this prevents pairing a new address with an old clock-in validation point.
