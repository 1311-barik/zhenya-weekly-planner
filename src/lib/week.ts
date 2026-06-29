// Работа с датами недели. Канонический формат даты — "YYYY-MM-DD".
// Дни храним как UTC-полночь соответствующего календарного дня,
// чтобы избежать сдвигов часового пояса (приложение — однопользовательское).

export type DateKey = string; // "YYYY-MM-DD"

export function toDateKey(d: Date): DateKey {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

// Понедельник недели, в которую попадает дата (UTC-полночь).
export function startOfWeek(d: Date): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (r.getUTCDay() + 6) % 7; // 0 = Пн … 6 = Вс
  return addDays(r, -dow);
}

// Семь дат недели, начиная с понедельника.
export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// Индекс дня недели: 0 = Пн … 6 = Вс
export function weekdayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

// Сегодняшняя дата как UTC-полночь (по локальному календарю пользователя).
export function todayKey(): DateKey {
  const now = new Date();
  return toDateKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// "23 — 29 июня 2025"
export function formatWeekTitle(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const d1 = weekStart.getUTCDate();
  const d2 = end.getUTCDate();
  const m1 = MONTHS_GEN[weekStart.getUTCMonth()];
  const m2 = MONTHS_GEN[end.getUTCMonth()];
  const y = end.getUTCFullYear();
  if (weekStart.getUTCMonth() === end.getUTCMonth()) {
    return `${d1} — ${d2} ${m2} ${y}`;
  }
  return `${d1} ${m1} — ${d2} ${m2} ${y}`;
}
