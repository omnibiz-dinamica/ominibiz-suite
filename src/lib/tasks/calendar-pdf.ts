/**
 * 22/11/2026 — Tarefas → calendário → "Exportar PDF".
 *
 * Exporta a SEMANA mostrada (segunda a domingo), agrupada como no ecrã (por
 * colaborador, por cliente ou "todas"): uma linha por grupo e uma coluna por
 * dia. Se houver tarefas selecionadas, só essas; sem seleção, todas as que o
 * calendário mostra (já com os filtros do ecrã aplicados). Só leitura.
 */
import { taskCalendarDateKey, tasksForCalendarDay } from "@/lib/tasks/calendar-filter";
import { formatWallTime } from "@/lib/wall-clock";

export type CalendarPdfTask = {
  id: string;
  title: string;
  assigned_to: string | null;
  client_id?: string | null;
  scheduled_for?: string | null;
  scheduled_end?: string | null;
  recurrence_date?: string | null;
  due_at?: string | null;
  status?: string | null;
};

/** Uma tarefa numa célula: horas (azul), cliente/título (negrito), extra (cinza). */
export type CalendarPdfItem = { time: string; title: string; extra: string };

export function taskItem(t: CalendarPdfTask, extra?: string | null): CalendarPdfItem {
  const start = formatWallTime(t.scheduled_for);
  const end = formatWallTime(t.scheduled_end);
  const status =
    t.status === "cancelado" ? "[cancelada]" : t.status === "concluido" ? "[concluída]" : "";
  return {
    time: start ? `${start}${end ? `–${end}` : ""}` : "",
    title: t.title,
    extra: [extra ? `(${extra})` : "", status].filter(Boolean).join(" "),
  };
}

export type CalendarPdfGroupBy = "assignee" | "client" | "all";

export type CalendarPdfPlan = {
  weekStart: string;
  weekEnd: string;
  days: { key: string; label: string }[];
  rows: { label: string; cells: string[]; items: CalendarPdfItem[][] }[];
  taskCount: number;
  source: "selecionadas" | "todas";
};

const WEEKDAY = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-23" + n dias (sem fuso: datas de calendário). */
export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Segunda-feira da semana de uma data YYYY-MM-DD. */
export function mondayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDaysKey(key, -((dow + 6) % 7));
}

export const brDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** "09:00–12:30 Título (Nome)" — a etiqueta extra é o colaborador/cliente que não é o grupo. */
export function taskLine(t: CalendarPdfTask, extra?: string | null): string {
  const start = formatWallTime(t.scheduled_for);
  const end = formatWallTime(t.scheduled_end);
  const time = start ? `${start}${end ? `–${end}` : ""} ` : "";
  const status =
    t.status === "cancelado" ? " [cancelada]" : t.status === "concluido" ? " [concluída]" : "";
  return `${time}${t.title}${extra ? ` (${extra})` : ""}${status}`;
}

export function planCalendarPdf(p: {
  tasks: CalendarPdfTask[];
  selectedIds: ReadonlySet<string> | undefined;
  /** Qualquer dia da semana mostrada (YYYY-MM-DD). */
  anyDayOfWeek: string;
  groupBy: CalendarPdfGroupBy;
  memberName: (id: string | null) => string;
  clientName: (id: string | null) => string;
}): CalendarPdfPlan {
  const weekStart = mondayOf(p.anyDayOfWeek);
  const days = WEEKDAY.map((w, i) => {
    const key = addDaysKey(weekStart, i);
    return { key, label: `${w} ${brDate(key)}` };
  });
  const weekEnd = days[6].key;
  const selected = p.selectedIds && p.selectedIds.size > 0 ? p.selectedIds : null;
  const inWeek = p.tasks.filter((t) => {
    if (selected && !selected.has(t.id)) return false;
    const k = taskCalendarDateKey(t);
    return !!k && k >= weekStart && k <= weekEnd;
  });

  const groups = new Map<string, CalendarPdfTask[]>();
  for (const t of inWeek) {
    const key =
      p.groupBy === "all"
        ? "__all__"
        : p.groupBy === "assignee"
          ? (t.assigned_to ?? "__none__")
          : (t.client_id ?? "__none__");
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const labelOf = (key: string) =>
    p.groupBy === "all"
      ? "Tarefas"
      : p.groupBy === "assignee"
        ? p.memberName(key === "__none__" ? null : key)
        : p.clientName(key === "__none__" ? null : key);

  const extraOf = (t: CalendarPdfTask) =>
    p.groupBy === "assignee" ? null : t.assigned_to ? p.memberName(t.assigned_to) : null;
  const rows = [...groups.entries()]
    .map(([key, list]) => {
      const perDay = days.map((d) => tasksForCalendarDay(list, d.key));
      return {
        label: labelOf(key),
        cells: perDay.map((ts) => ts.map((t) => taskLine(t, extraOf(t))).join("\n\n")),
        items: perDay.map((ts) => ts.map((t) => taskItem(t, extraOf(t)))),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt"));

  return {
    weekStart,
    weekEnd,
    days,
    rows,
    taskCount: inWeek.length,
    source: selected ? "selecionadas" : "todas",
  };
}

export async function downloadCalendarPdf(
  plan: CalendarPdfPlan,
  meta: { groupBy: CalendarPdfGroupBy; companyName?: string | null; primaryColor?: string | null },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const m = /^#?([0-9a-f]{6})$/i.exec(meta.primaryColor ?? "");
  const rgb: [number, number, number] = m
    ? [
        parseInt(m[1].slice(0, 2), 16),
        parseInt(m[1].slice(2, 4), 16),
        parseInt(m[1].slice(4, 6), 16),
      ]
    : [83, 111, 47];

  const period = `${brDate(plan.weekStart)} a ${brDate(plan.weekEnd)}/${plan.weekEnd.slice(0, 4)}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Calendário de tarefas — ${period}`, 28, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  const groupTxt =
    meta.groupBy === "assignee"
      ? "por colaborador"
      : meta.groupBy === "client"
        ? "por cliente"
        : "";
  doc.text(
    [
      meta.companyName,
      `${plan.taskCount} tarefa(s) ${plan.source === "selecionadas" ? "selecionada(s)" : "do calendário"}${groupTxt ? ` · ${groupTxt}` : ""}`,
    ]
      .filter(Boolean)
      .join(" · "),
    28,
    48,
  );
  doc.text(
    new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }),
    pageWidth - 28,
    32,
    {
      align: "right",
    },
  );

  const firstCol = meta.groupBy === "all" ? 0 : 92;
  const dayCol = (pageWidth - 56 - firstCol) / 7;
  const FONT = 7;
  const PAD = 3;
  const LINE = FONT * 1.15;
  const BLUE: [number, number, number] = [0, 56, 168]; // horas: azul forte
  // Cada tarefa já partida em linhas (com a largura do negrito): a mesma
  // lista serve para a altura da célula e para o desenho.
  type Line = { text: string; kind: "time" | "title" | "extra" | "gap" };
  const wrap = (text: string, bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(FONT);
    return doc.splitTextToSize(text, dayCol - PAD * 2 - 1) as string[];
  };
  const cellLines: Line[][][] = plan.rows.map((r) =>
    r.items.map((items) => {
      const out: Line[] = [];
      items.forEach((it, i) => {
        if (i > 0) out.push({ text: "", kind: "gap" });
        if (it.time) out.push({ text: it.time, kind: "time" });
        for (const l of wrap(it.title, true)) out.push({ text: l, kind: "title" });
        if (it.extra) for (const l of wrap(it.extra, false)) out.push({ text: l, kind: "extra" });
      });
      return out;
    }),
  );
  const dayIdx = (col: number) => col - (firstCol ? 1 : 0);
  autoTable(doc, {
    startY: 60,
    margin: { left: 28, right: 28 },
    head: [
      [
        ...(firstCol ? [meta.groupBy === "client" ? "Cliente" : "Colaborador"] : []),
        ...plan.days.map((d) => d.label),
      ],
    ],
    body: plan.rows.map((r, ri) => [
      ...(firstCol ? [r.label] : []),
      ...cellLines[ri].map((lines) => lines.map((l) => l.text || " ").join("\n")),
    ]),
    // As células dos dias são desenhadas à mão (horas a azul, cliente a negrito).
    willDrawCell: (data) => {
      if (data.section === "body" && dayIdx(data.column.index) >= 0) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || dayIdx(data.column.index) < 0) return;
      const lines = cellLines[data.row.index]?.[dayIdx(data.column.index)] ?? [];
      let y = data.cell.y + PAD + FONT * 0.85;
      for (const l of lines) {
        if (l.kind !== "gap") {
          doc.setFontSize(FONT);
          doc.setFont("helvetica", l.kind === "title" ? "bold" : "normal");
          if (l.kind === "time") doc.setTextColor(...BLUE);
          else if (l.kind === "extra") doc.setTextColor(110, 110, 110);
          else doc.setTextColor(25, 25, 25);
          doc.text(l.text, data.cell.x + PAD, y);
        }
        y += LINE;
      }
      doc.setTextColor(0, 0, 0);
    },
    styles: {
      font: "helvetica",
      fontSize: FONT,
      cellPadding: PAD,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: { fillColor: rgb, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries([
      ...(firstCol ? [[0, { cellWidth: firstCol, fontStyle: "bold" as const }]] : []),
      ...plan.days.map((_, i) => [i + (firstCol ? 1 : 0), { cellWidth: dayCol }]),
    ]),
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Página ${data.pageNumber}`,
        pageWidth - 28,
        doc.internal.pageSize.getHeight() - 12,
        {
          align: "right",
        },
      );
    },
  });
  doc.save(`calendario-tarefas-${plan.weekStart}.pdf`);
}
