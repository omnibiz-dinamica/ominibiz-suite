# Homologação — Reabertura, devolução e encaminhamento de tickets

Cenários:

1. Ticket aberto/em análise/em desenvolvimento → caixa de resposta normal, botão "Enviar", sem modal. OK
2. Ticket resolvido/fechado/rejeitado → caixa normal escondida; botão "Responder / reabrir" abre o modal canónico. OK
3. Ticket criado por Funcionário → modal mostra apenas "Este ticket será devolvido para: [Nome]"; ao enviar, status volta a `aberto`, `assigned_user_id = requester_user_id`, `support_level='company'`, `current_owner_role='employee'`, notificação "Seu ticket foi reaberto pelo Gestor.". OK
4. Ticket criado por Gestor/Owner → escolha entre Funcionário (EmployeePicker, apenas ativos da mesma empresa) e Suporte Técnico. OK
5. Destino Suporte Técnico → `support_level='technical'`, `current_owner_role='super_admin'`, `escalated_to_super_admin=true`, contexto técnico agregado, Super Admin notificado. OK
6. Timeline registra `ticket_reopened` com `previous_status`, `new_status`, `destination_type`, `assigned_user_id`, `technical_context`, `reopened_at`, `message`. OK
7. Modal responsivo (full-screen mobile, `size="lg"` desktop), header fixo, corpo rolável, rodapé fixo. OK
8. Nenhum ticket, mensagem, anexo ou evento apagado. OK
