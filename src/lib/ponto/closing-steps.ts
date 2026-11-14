/**
 * Fecho do mês passo a passo (14/11/2026, pedido do Marco: "faço o quê agora?").
 * Espelha as regras do banco (timesheet_manager_close só depois de assinado;
 * timesheet_send_to_accounting só depois de fechado). O banco continua a
 * validar; aqui é só para o gestor saber o próximo passo e não ver botões que
 * iam dar erro.
 */
import type { TimesheetStatus } from "@/lib/timesheet";

export type ClosingStep = {
  /** Passo do processo (1–5) para mostrar "Passo N de 5". */
  step: number;
  next: string;
  canClose: boolean;
  canSend: boolean;
};

export const CLOSING_STEPS_TOTAL = 5;

export function closingNextStep(status: TimesheetStatus): ClosingStep {
  switch (status) {
    case "em_aberto":
      return {
        step: 1,
        next: "Abrir o mês para este funcionário",
        canClose: false,
        canSend: false,
      };
    case "aguardando_funcionario":
      return {
        step: 2,
        next: "Conferir os pontos (Ver) · o funcionário confere e assina",
        canClose: false,
        canSend: false,
      };
    case "aguardando_correcao":
      return {
        step: 2,
        next: "Corrigir o que o funcionário pediu · depois ele assina",
        canClose: false,
        canSend: false,
      };
    case "assinado_funcionario":
    case "em_conferencia":
      return { step: 3, next: "Fechar a folha", canClose: true, canSend: false };
    case "fechado_gestor":
      return { step: 4, next: "Enviar à contabilidade", canClose: false, canSend: true };
    case "disponivel_contabilidade":
      return {
        step: 5,
        next: "Concluído · já está com a contabilidade",
        canClose: false,
        canSend: false,
      };
    default:
      return { step: 1, next: "—", canClose: false, canSend: false };
  }
}
