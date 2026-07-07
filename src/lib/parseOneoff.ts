// Разбор строки разового дела: вытаскиваем день недели и время из текста,
// который пишут естественно: «Встреча. Вторник. 10:00.» / «Самолёт в понедельник».

export interface ParsedOneoff {
  dayIndex: number | null; // 0 = Пн … 6 = Вс
  start: number | null; // минуты от полуночи, если время указано
  title: string; // очищенное название (без дня/времени)
}

// Полные формы дней (включая падежи), в порядке 0=Пн … 6=Вс.
const DAY_WORDS: RegExp[] = [
  /понедельник\w*/i,
  /вторник\w*/i,
  /серед|сред[ауыой]\w*|среда/i,
  /четверг\w*/i,
  /пятниц[ауыей]\w*|пятница/i,
  /суббот[ауыой]\w*|суббота/i,
  /воскресень\w*|воскресенье/i,
];
const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function parseOneoff(text: string): ParsedOneoff {
  const lower = text.toLowerCase();

  // 1) день недели
  let dayIndex: number | null = null;
  for (let i = 0; i < DAY_WORDS.length; i++) {
    if (DAY_WORDS[i].test(lower)) {
      dayIndex = i;
      break;
    }
  }
  if (dayIndex === null) {
    const tokens = lower.split(/[^а-яё0-9]+/i);
    for (let i = 0; i < DAY_SHORT.length; i++) {
      if (tokens.includes(DAY_SHORT[i])) {
        dayIndex = i;
        break;
      }
    }
  }

  // 2) время: 10:00 / 10.00 / 15 ч
  let start: number | null = null;
  const colon = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h < 24 && m < 60) start = h * 60 + m;
  } else {
    const hourOnly = text.match(/\b(\d{1,2})\s*ч\b/i);
    if (hourOnly) {
      const h = Number(hourOnly[1]);
      if (h < 24) start = h * 60;
    }
  }

  // 3) очистка названия
  let title = text;
  title = title.replace(/\b\d{1,2}[:.]\d{2}\b/g, " ");
  title = title.replace(/\b\d{1,2}\s*ч\.?/gi, " ");
  for (const re of DAY_WORDS) title = title.replace(new RegExp(re.source, "gi"), " ");
  // короткие формы как отдельные токены
  title = title.replace(/(^|[^а-яё])(пн|вт|ср|чт|пт|сб|вс)(?=[^а-яё]|$)/gi, "$1 ");
  // предлоги «в/во» перед днём
  title = title.replace(/(^|\s)(во?)\s+/gi, "$1");
  title = title.replace(/[.,;:!?]+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) title = text.trim();

  return { dayIndex, start, title };
}
