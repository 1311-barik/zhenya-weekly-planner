// Разбор строки разового дела: вытаскиваем день недели, время и (если указана)
// длительность из текста, который пишут естественно: «Встреча. Вторник. 10:00.»,
// «Самолёт в понедельник», «Парикмахер, вторник, 17:00, 2 часа».

import { ALL_DAY_DURATION_MIN } from "./config";

export interface ParsedOneoff {
  dayIndex: number | null; // 0 = Пн … 6 = Вс
  start: number | null; // минуты от полуночи, если время указано
  duration: number | null; // минуты, если длительность указана явно
  title: string; // очищенное название (без дня/времени/длительности)
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

const MIN_PARSED_DURATION = 5;
const MAX_PARSED_DURATION = ALL_DAY_DURATION_MIN;
const ALL_DAY_PATTERN = /(?:на\s+)?(?:весь|целый)\s+день|в\s+течение\s+всего\s+дня/iu;

export function parseOneoff(text: string): ParsedOneoff {
  let duration: number | null = null;
  let start: number | null = null;
  let working = text;

  // «Работа весь день» — продуктовый пресет на 10 часов. Точное время или
  // длительность, если они указаны рядом, остаются более сильным сигналом.
  const allDay = working.match(ALL_DAY_PATTERN);
  if (allDay) {
    const i = allDay.index ?? 0;
    working = working.slice(0, i) + " " + working.slice(i + allDay[0].length);
  }

  // 0а) диапазон времени: «13:00-14:00», «13:00–15:30», «с 13:00 до 15:30» —
  // даёт сразу и начало, и длительность. Проверяем раньше отдельного «2 часа»/«90 мин».
  const rangeDash = working.match(
    /(?:с\s+)?(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})(?=[^\d]|$)/
  );
  const rangeSlovo = working.match(
    /(?:с\s+)?(\d{1,2}(?:[:.]\d{2})?)\s*до\s*(\d{1,2}(?:[:.]\d{2})?)(?=[^\p{L}\d]|$)/iu
  );
  const range = rangeDash ?? rangeSlovo;
  if (range) {
    const [h1, m1] = range[1].split(/[:.]/);
    const [h2, m2] = range[2].split(/[:.]/);
    const nh1 = Number(h1);
    const nh2 = Number(h2);
    const nm1 = m1 ? Number(m1) : 0;
    const nm2 = m2 ? Number(m2) : 0;
    const s = nh1 * 60 + nm1;
    const e = nh2 * 60 + nm2;
    if (nh1 < 24 && nh2 < 24 && nm1 < 60 && nm2 < 60 && e > s) {
      start = s;
      duration = e - s;
      const i = range.index ?? 0;
      working = working.slice(0, i) + " " + working.slice(i + range[0].length);
    }
  }

  // 0б) длительность словом: «2 часа», «1.5 ч», «90 мин». Вырезаем из текста
  // заранее, чтобы не спутать с временем (там всегда есть отдельный час дня, «17:00»).
  if (duration === null) {
    const durMinutes = working.match(/(\d{1,3})\s*мин(?:ут[ыу]?)?\.?(?=[^\p{L}]|$)/iu);
    if (durMinutes) {
      duration = Number(durMinutes[1]);
      const i = durMinutes.index ?? 0;
      working = working.slice(0, i) + " " + working.slice(i + durMinutes[0].length);
    } else {
      const durHours = working.match(
        /(\d{1,2}[.,]\d)\s*ч\.?(?=[^\p{L}\d]|$)|(\d{1,2})\s*час(?:а|ов)?\.?(?=[^\p{L}]|$)/iu
      );
      if (durHours) {
        const raw = (durHours[1] ?? durHours[2]).replace(",", ".");
        duration = Math.round(Number(raw) * 60);
        const i = durHours.index ?? 0;
        working = working.slice(0, i) + " " + working.slice(i + durHours[0].length);
      }
    }
  }
  if (duration === null && allDay) duration = ALL_DAY_DURATION_MIN;
  if (duration !== null && (duration < MIN_PARSED_DURATION || duration > MAX_PARSED_DURATION)) {
    duration = null;
  }

  const lower = working.toLowerCase();

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

  // 2) время: 10:00 / 10.00 / 15 ч (пропускаем, если уже определили из диапазона)
  if (start === null) {
    const colon = working.match(/(^|[^\d])(\d{1,2})[:.](\d{2})(?=[^\d]|$)/);
    if (colon) {
      const h = Number(colon[2]);
      const m = Number(colon[3]);
      if (h < 24 && m < 60) start = h * 60 + m;
    } else {
      const hourOnly = working.match(/(^|[^\d])(\d{1,2})\s*ч\.?(?=[^\p{L}\d]|$)/iu);
      if (hourOnly) {
        const h = Number(hourOnly[2]);
        if (h < 24) start = h * 60;
      }
    }
  }

  // 3) очистка названия
  let title = working;
  title = title.replace(/(^|[^\d])\d{1,2}[:.]\d{2}(?=[^\d]|$)/g, "$1 ");
  title = title.replace(/(^|[^\d])\d{1,2}\s*ч\.?(?=[^\p{L}\d]|$)/giu, "$1 ");
  for (const re of DAY_WORDS) title = title.replace(new RegExp(re.source, "gi"), " ");
  // короткие формы как отдельные токены
  title = title.replace(/(^|[^а-яё])(пн|вт|ср|чт|пт|сб|вс)(?=[^а-яё]|$)/gi, "$1 ");
  // предлоги «в/во» перед днём
  title = title.replace(/(^|\s)(во?)\s+/gi, "$1");
  title = title.replace(/[.,;:!?]+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) title = text.trim();

  return { dayIndex, start, duration, title };
}
