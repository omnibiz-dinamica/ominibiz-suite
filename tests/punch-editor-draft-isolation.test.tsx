import { afterEach, describe, expect, it, mock } from "bun:test";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { draftKey, readDraft, writeDraft } from "../src/lib/form-draft";
import type { AdminTimeEntry } from "../src/lib/punch-admin";

// Exercise the real editor, queries and localStorage hook without browser portals
// or writes to hosted time entries.
const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() { return storage.size; },
};
const calls: { name: string; args: Record<string, unknown> }[] = [];
const identity = { user: { id: "manager" } };
mock.module("@/lib/auth", () => ({ useAuth: () => identity }));
mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({ data: [], error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: {}, error: null };
    },
  },
}));
function Container({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return createElement("div", props, children);
}
mock.module("@/components/ui/sheet", () => ({
  Sheet: Container, SheetContent: Container, ModalBody: Container,
  ModalFooter: Container, ModalHeader: Container, ModalSection: Container,
}));
mock.module("@/components/ui/select", () => ({
  Select: Container, SelectContent: Container, SelectItem: Container,
  SelectTrigger: Container, SelectValue: Container,
}));
const { PunchEditorDrawer } = await import("../src/components/ponto/PunchEditorDrawer");
const { toLocalInput } = await import("../src/lib/punch-admin");

const entry = (id: string): AdminTimeEntry => ({
  id, user_id: `employee-${id}`, task_id: `task-${id}`, company_id: "company-a",
  started_at: "2026-10-26T08:00:00Z", ended_at: "2026-10-26T17:00:00Z",
  paused_at: null, resumed_at: null, notes: `notes-${id}`, entry_kind: "work",
  updated_at: "2026-10-26T17:00:00Z", origin: "employee_punch",
  created_by: null, last_edited_by: null, last_edited_at: null,
  last_edit_reason: null,
} as AdminTimeEntry);
const draftValues = (id: string) => ({
  form: {
    entry_kind: "work", user_id: `employee-${id}`, task_id: `task-${id}`,
    leave_date: "2026-10-26", leave_minutes: "480",
    started_at: toLocalInput("2026-10-26T08:00:00Z"),
    ended_at: toLocalInput("2026-10-26T17:00:00Z"),
    paused_at: "", resumed_at: "", notes: `draft-${id}`, reason: "correction",
  },
  pauseRows: [{ paused_at: toLocalInput("2026-10-26T12:00:00Z"), resumed_at: toLocalInput("2026-10-26T12:30:00Z") }],
  pausesDirty: true,
});
let renderer: ReactTestRenderer | null = null;
let client: QueryClient | null = null;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  client?.clear();
  renderer = null;
  storage.clear();
  calls.length = 0;
});

describe("punch editor draft isolation", () => {
  it("keeps A's restored pauses out of B's correction and draft after casual close", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, window: {
      localStorage, addEventListener() {}, removeEventListener() {},
    } });
    writeDraft(localStorage, draftKey("manager", "company-a", "punch-editor", "A"), draftValues("A"), {
      open: false, baseUpdatedAt: entry("A").updated_at,
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderEntry = (id: string, open: boolean) => createElement(QueryClientProvider, { client: client as QueryClient },
      createElement(PunchEditorDrawer, { open, onOpenChange() {}, mode: "edit", companyId: "company-a", entry: entry(id) }));
    await act(async () => { renderer = create(renderEntry("A", true)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const root = () => {
      if (!renderer) throw new Error("Editor not mounted");
      return renderer.root;
    };
    expect(root().findAllByType("input").map(input => input.props.value)).toContain(draftValues("A").pauseRows[0]?.paused_at);
    await act(async () => root().findAllByType("textarea")[0]?.props.onChange({ target: { value: "A changed" } }));
    await act(async () => root().findByProps({ open: true }).props.onOpenChange(false));
    await act(async () => renderer?.update(renderEntry("A", false)));
    await act(async () => renderer?.update(renderEntry("B", true)));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(root().findAllByType("input")).toHaveLength(2); // B has no pauses
    expect(root().findAllByType("textarea")[0]?.props.value).toBe("notes-B");
    await act(async () => root().findAllByType("textarea")[0]?.props.onChange({ target: { value: "B correction" } }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
    const bDraft = readDraft<{ pauseRows: unknown[]; pausesDirty: boolean }>(localStorage, draftKey("manager", "company-a", "punch-editor", "B"));
    expect(bDraft?.values.pauseRows).toEqual([]);
    expect(bDraft?.values.pausesDirty).toBe(false);
    await act(async () => {
      const save = root().findAllByType("button").find(button => button.props.children === "Aplicar correção");
      if (!save) throw new Error("Save button missing");
      save.props.onClick();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(calls).toEqual([{ name: "punch_admin_update", args: { _id: "B", _payload: { notes: "B correction" }, _reason: "" } }]);
    expect(readDraft(localStorage, draftKey("manager", "company-a", "punch-editor", "A"))?.values).toMatchObject({
      form: { notes: "A changed" }, pauseRows: draftValues("A").pauseRows, pausesDirty: true,
    });
  });
});