export const VND_STEP = 10_000;

export type VndStepDirection = -1 | 1;

export function parseVndInteger(value: string | number): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getSteppedVndValue(
  currentValue: string | number,
  direction: VndStepDirection,
  min = 0,
): number | null {
  const current = parseVndInteger(currentValue);
  if (current === null) return null;
  const next = current + direction * VND_STEP;
  if (!Number.isSafeInteger(next) || next < min) return null;
  return next;
}
