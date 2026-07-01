// Общие константы планировщика.

// Временная шкала дня
export const DAY_START_HOUR = 6; // 06:00
export const DAY_END_HOUR = 23; // 23:00
export const SLOT_MINUTES = 15; // шаг позиционирования и resize
export const HOUR_HEIGHT = 60; // px на час в сетке (десктоп)
export const MIN_BLOCK_MINUTES = 15;

export const DAY_START_MIN = DAY_START_HOUR * 60;
export const DAY_END_MIN = DAY_END_HOUR * 60;

// Дни недели: 0 = Пн … 6 = Вс
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEKDAYS_FULL = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

// Палитра цветов блоков. Ключ → значения для точки и CSS-класса.
export type ColorKey =
  | "blue"
  | "purple"
  | "green"
  | "bordeaux"
  | "orange"
  | "mint"
  | "rose"
  | "gold";

export const COLORS: Record<ColorKey, { dot: string; label: string }> = {
  blue: { dot: "#6E9EBF", label: "Синий" },
  purple: { dot: "#8B7FA8", label: "Лавандовый" },
  green: { dot: "#7A9B7A", label: "Зелёный" },
  bordeaux: { dot: "#C4897A", label: "Бордовый" },
  orange: { dot: "#C4704A", label: "Оранжевый" },
  mint: { dot: "#7AAFA8", label: "Мятный" },
  rose: { dot: "#C4899A", label: "Розовый" },
  gold: { dot: "#C9A96E", label: "Золотой" },
};

export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

// Нормы недели (обязательные блоки).
export type NormType = "atelier" | "gym";

export const NORMS: Record<
  NormType,
  { label: string; emoji: string; required: number; minDuration: number }
> = {
  atelier: { label: "Ателье", emoji: "🧵", required: 2, minDuration: 240 },
  gym: { label: "Спорт", emoji: "🏋️", required: 2, minDuration: 180 },
};

export const NORM_TYPES = Object.keys(NORMS) as NormType[];

// Постоянные (переходящие из недели в неделю) события.
// day: 0 = Пн … 6 = Вс; start — минуты от полуночи.
export interface RecurringEvent {
  title: string;
  color: ColorKey;
  day: number;
  start: number;
  duration: number;
  kind?: NormType | null;
}

export const RECURRING_EVENTS: RecurringEvent[] = [
  { title: "🧘 Йога", color: "mint", day: 0, start: 18 * 60 + 30, duration: 60 }, // Пн 18:30
  { title: "🎓 Инна", color: "blue", day: 1, start: 13 * 60, duration: 30 }, // Вт 13:00
  { title: "🎓 Роберт", color: "blue", day: 1, start: 14 * 60, duration: 60 }, // Вт 14:00
  { title: "🎓 Роберт", color: "blue", day: 4, start: 11 * 60, duration: 60 }, // Пт 11:00
  { title: "🎓 Инна", color: "blue", day: 4, start: 13 * 60, duration: 30 }, // Пт 13:00
];
