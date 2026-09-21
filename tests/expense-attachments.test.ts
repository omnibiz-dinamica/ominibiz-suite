import assert from "node:assert/strict";
import test from "node:test";
import { expenseMonthBounds, safeExpenseAttachmentName } from "../src/lib/expense-attachments";

test("month bounds include only the selected calendar month", () => {
  assert.deepEqual(expenseMonthBounds("2026-08"), { start: "2026-08-01", end: "2026-09-01" });
  assert.deepEqual(expenseMonthBounds("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  assert.equal(expenseMonthBounds("2026-13"), null);
});

test("attachment names are readable, unique and filesystem-safe", () => {
  assert.equal(
    safeExpenseAttachmentName({
      expenseDate: "2026-08-12",
      employeeName: "João da Silva",
      reason: "Combustível / Obra A",
      id: "12345678-1234-1234-1234-123456789abc",
      extension: "JPG",
    }),
    "2026-08-12_Joao-da-Silva_Combustivel-Obra-A_12345678.jpg",
  );
});