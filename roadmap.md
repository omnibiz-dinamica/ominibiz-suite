# Roadmap
- [x] Cleanup TESTE-LOTE-% (170 tasks, 677 notifications + 508 audit rows via cascade)
- [x] Ensaios 07/10: ACL originais, reversão v3, _notify dois ramos medido (sem aplicar), ensaio v3 com rollback, janela 19–20h, linha de base TESTE-ANTES (arquivada)
- [ ] _notify v2 (dois ramos): pronta em notify_correcao_v2.sql, não aplicada — aguarda decisão
- [ ] Aplicar v3 hoje às 19:00 Bruxelas — aguarda "aplicar" do Eduardo
- [ ] Após aplicar: cron EXECUTE + extensão manual; tempo do próprio gatilho (≤1 s/100, ≤20 ms/1); lista completa de testes; comparar com a linha de base TESTE-ANTES
- [ ] Depois: timeline UI + filtros kind='queue' no mesmo publish
