# Roadmap
- [ ] Separate bug: trg_tasks_notify_update / _notify slow (~240 ms per task; Super Admin has 344k notifications); occasional statement timeout (57014) when cancelling
- [ ] Apply migration v3 in the window 01:00–02:00 Brussels — waiting for user to confirm the window
- [ ] After applying: full test list (incl. company cascade delete, latency 1/100/400, rollback check)
- [ ] Then: timeline UI + kind='queue' filters in the same publish
