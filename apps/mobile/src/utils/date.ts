export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function recentIsoDates(days: number) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() - index);
    return value.toISOString().slice(0, 10);
  });
}

export function numeric(value: string) {
  const result = Number(value.trim());
  return Number.isFinite(result) ? result : null;
}
