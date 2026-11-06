
- All NEW employee assignment pickers use server-filtered `company_active_member_options`; inactivity is global (`is_active`, `status`, effective `termination_date`), while historical records retain names.
- Client location saves use the browser-safe location resolver and await address geocoding; manual coordinate edits and their reverse-geocoded addresses are confirmed together, while radius-only edits are not, to preserve exact pins without accepting stale locations.
- Keep the punch editor session keyed by user, company, mode and target identity so restored pauses and pending draft writes cannot cross records.
- Task duration fallback must include full wall-clock dates for standalone tasks and only daily shift times for recurrences, so load division cannot truncate multi-day tasks or inflate recurring shifts.
- Retail stock changes go only through the `retail_stock_move` RPC (movement INSERT before balance UPDATE inside one unique_violation-protected block); the frontend never writes `retail_stock_balances`/`retail_stock_movements`, so idempotent replays can never change a balance twice and history stays immutable.
