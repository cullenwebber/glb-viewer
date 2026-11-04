export function scrubbedNumber(
  start: number,
  amount: number,
  step: number,
  min: number,
  max: number,
  fine = false,
) {
  const resolution = fine && step < 1 ? step / 10 : step;
  const value = start + Math.round(amount / resolution) * resolution;
  return Math.max(min, Math.min(max, Number(value.toPrecision(12))));
}

export function numericAttribute(value: string | null, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
