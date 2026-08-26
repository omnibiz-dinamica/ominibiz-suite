-- ADR-048 · afinação: prioridade determinística + limite de palavra
CREATE OR REPLACE FUNCTION public.support_detect_action(_kw text[], _norm text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  lex jsonb := '[
    ["refuse",   ["recusar","recusa","recuso","recusei","recusada","recusado","rejeitar","rejeito","rejeitada","rejeicao","declinar"]],
    ["approve",  ["aprovar","aprovacao","aprovada","aprovado","autorizar","autorizacao","validar"]],
    ["complete", ["concluir","conclusao","concluida","concluido","finalizar","terminar","encerrar"]],
    ["start",    ["iniciar","inicio","iniciada","iniciado","comecar","arrancar","retomar"]],
    ["punch",    ["picar","picagem","picagens","batida"]],
    ["assign",   ["atribuir","atribuicao","designar","encaminhar","reatribuir"]],
    ["delete",   ["apagar","excluir","eliminar","remover","cancelar","cancelamento","cancelada","cancelado","arquivar"]],
    ["create",   ["criar","criacao","criada","criado","adicionar","incluir","cadastrar","agendar"]],
    ["edit",     ["editar","alterar","alteracao","atualizar","corrigir","correcao","modificar","ajustar"]],
    ["send",     ["enviar","envio","enviada","enviado","notificar"]],
    ["upload",   ["anexar","anexo","upload","importar","exportar","descarregar"]],
    ["save",     ["salvar","gravar","guardar","submeter"]],
    ["login",    ["login","autenticar","credenciais","palavra-passe"]],
    ["view",     ["visualizar","aparecer","desaparecer","desapareceu","sumiu","invisivel","exibir","mostrar","listar","ordenar","filtrar"]]
  ]'::jsonb;
  item jsonb;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(lex) LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(item -> 1) t(w)
      WHERE t.w = ANY(_kw) OR _norm ~ ('\m' || t.w)
    ) THEN
      RETURN item ->> 0;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_detect_entity(_kw text[], _norm text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  lex jsonb := '[
    ["vacation",    ["ferias","feria","ausencia","ausencias"]],
    ["timesheet",   ["ponto","picagem","picagens","folha","jornada","assiduidade"]],
    ["expense",     ["despesa","despesas","reembolso","reembolsos"]],
    ["payslip",     ["recibo","recibos","salario","vencimento","vencimentos"]],
    ["fleet",       ["veiculo","veiculos","viatura","viaturas","frota","combustivel","abastecimento"]],
    ["geo",         ["geolocalizacao","localizacao","raio","coordenadas"]],
    ["task",        ["tarefa","tarefas","servico","servicos","ocorrencia","recorrencia","recorrente"]],
    ["ticket",      ["ticket","tickets","chamado","chamados","suporte"]],
    ["notification",["notificacao","notificacoes","alerta","alertas"]],
    ["navigation",  ["menu","navegacao","sidebar","separador"]],
    ["report",      ["relatorio","relatorios","exportacao","dashboard","indicadores"]],
    ["client",      ["cliente","clientes"]],
    ["employee",    ["funcionario","funcionarios","colaborador","colaboradores","utilizador","utilizadores","usuario","usuarios","equipa"]],
    ["auth",        ["convite","convites","permissao","permissoes","acesso","acessos","perfil"]],
    ["company",     ["empresa","empresas","contrato","contratos","faturacao","faturamento","fatura"]]
  ]'::jsonb;
  item jsonb;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(lex) LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(item -> 1) t(w)
      WHERE t.w = ANY(_kw) OR _norm ~ ('\m' || t.w)
    ) THEN
      RETURN item ->> 0;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

UPDATE public.support_tickets SET title = title;
