# Roadmap
- [x] Cleanup TESTE-LOTE-% (170 tasks, 677 notifications + 508 audit rows via cascade)
- [ ] _notify fix: proposal ready (notify_correcao_proposta.sql), not applied; pending: before/after inside ROLLBACK, employee start/complete 20, manager end series ~100 occurrences
- [ ] Apply v3 in 01:00–02:00 Brussels — waiting for user to confirm window; dry run BEGIN/ROLLBACK first
- [ ] After applying: cron EXECUTE check + manual extend run; own-trigger timing (≤1 s/100, ≤20 ms/1); full test list
- [ ] Then: timeline UI + kind='queue' filters in the same publish
