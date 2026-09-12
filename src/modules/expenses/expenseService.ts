import { endAt, onValue, orderByChild, push, query, ref, startAt, update, type Query, type Unsubscribe } from 'firebase/database';
import { db } from '../../firebase/client';
import type { AuditLog, Expense } from '../../types/models';

export interface ExpenseInput {
  category: string;
  amount: number;
  expenseDate: number;
  note?: string;
}

export interface ExpenseRange {
  from?: number;
  to?: number;
}

function requireDatabase() {
  if (!db) throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  return db;
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function buildAuditLog(
  id: string,
  actorUid: string,
  action: string,
  expenseId: string,
  summary: string,
  createdAt: number,
): AuditLog {
  return { id, actorUid, action, entityType: 'expense', entityId: expenseId, summary, createdAt };
}

function buildExpenseQuery(range: ExpenseRange): Query {
  const database = requireDatabase();
  const base = query(ref(database, 'expenses'), orderByChild('expenseDate'));
  if (typeof range.from === 'number' && typeof range.to === 'number') {
    return query(base, startAt(range.from), endAt(range.to));
  }
  if (typeof range.from === 'number') return query(base, startAt(range.from));
  if (typeof range.to === 'number') return query(base, endAt(range.to));
  return base;
}

export function subscribeExpenses(
  range: ExpenseRange,
  onExpenses: (expenses: Expense[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onValue(
    buildExpenseQuery(range),
    (snapshot) => {
      if (!snapshot.exists()) {
        onExpenses([]);
        return;
      }
      const raw = snapshot.val() as Record<string, Expense>;
      const expenses = Object.entries(raw)
        .map(([key, expense]) => ({ ...expense, id: expense.id || key }))
        .sort((a, b) => b.expenseDate - a.expenseDate || b.createdAt - a.createdAt);
      onExpenses(expenses);
    },
    (error) => onError(error instanceof Error ? error : new Error('Không thể tải lịch sử chi phí.')),
  );
}

export async function createExpense(input: ExpenseInput, actorUid: string): Promise<Expense> {
  const database = requireDatabase();
  const expenseKey = push(ref(database, 'expenses')).key;
  const auditKey = push(ref(database, 'auditLogs')).key;
  if (!expenseKey || !auditKey) throw new Error('Không thể tạo mã nội bộ cho chi phí.');

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('Số tiền chi phí phải là số nguyên VND lớn hơn 0.');
  }
  if (!input.category.trim()) throw new Error('Danh mục chi phí là bắt buộc.');
  if (!Number.isFinite(input.expenseDate) || input.expenseDate <= 0) throw new Error('Ngày chi phí không hợp lệ.');

  const now = Date.now();
  const expense: Expense = {
    id: expenseKey,
    code: `CP-${expenseKey.slice(-8).toLocaleUpperCase('vi')}`,
    category: input.category.trim(),
    amount: input.amount,
    expenseDate: input.expenseDate,
    status: 'completed',
    createdBy: actorUid,
    createdAt: now,
    updatedAt: now,
    ...(cleanOptional(input.note) ? { note: cleanOptional(input.note) } : {}),
  };

  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    'EXPENSE_CREATED',
    expenseKey,
    `Ghi nhận chi phí ${expense.code} - ${expense.category}`,
    now,
  );

  await update(ref(database), {
    [`expenses/${expenseKey}`]: expense,
    [`auditLogs/${auditKey}`]: auditLog,
  });
  return expense;
}

export async function updateExpense(existing: Expense, input: ExpenseInput, actorUid: string): Promise<Expense> {
  if (existing.status !== 'completed') throw new Error('Chi phí đã hủy không thể chỉnh sửa.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('Số tiền chi phí phải là số nguyên VND lớn hơn 0.');
  }
  if (!input.category.trim()) throw new Error('Danh mục chi phí là bắt buộc.');
  if (!Number.isFinite(input.expenseDate) || input.expenseDate <= 0) throw new Error('Ngày chi phí không hợp lệ.');

  const database = requireDatabase();
  const auditKey = push(ref(database, 'auditLogs')).key;
  if (!auditKey) throw new Error('Không thể tạo nhật ký thay đổi chi phí.');

  const now = Date.now();
  const expense: Expense = {
    id: existing.id,
    code: existing.code,
    category: input.category.trim(),
    amount: input.amount,
    expenseDate: input.expenseDate,
    status: existing.status,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedAt: now,
    ...(cleanOptional(input.note) ? { note: cleanOptional(input.note) } : {}),
  };

  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    'EXPENSE_UPDATED',
    existing.id,
    `Sửa chi phí ${expense.code} - ${expense.category}`,
    now,
  );

  await update(ref(database), {
    [`expenses/${existing.id}`]: expense,
    [`auditLogs/${auditKey}`]: auditLog,
  });
  return expense;
}

export async function cancelExpense(expense: Expense, actorUid: string) {
  if (expense.status === 'cancelled') return;

  const database = requireDatabase();
  const auditKey = push(ref(database, 'auditLogs')).key;
  if (!auditKey) throw new Error('Không thể tạo nhật ký hủy chi phí.');

  const now = Date.now();
  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    'EXPENSE_CANCELLED',
    expense.id,
    `Hủy chi phí ${expense.code} - ${expense.category}`,
    now,
  );

  await update(ref(database), {
    [`expenses/${expense.id}/status`]: 'cancelled',
    [`expenses/${expense.id}/updatedAt`]: now,
    [`auditLogs/${auditKey}`]: auditLog,
  });
}
