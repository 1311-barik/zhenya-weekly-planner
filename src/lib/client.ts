import {
  DAY_START_MIN,
  DAY_END_MIN,
  HOUR_HEIGHT,
  SLOT_MINUTES,
  NORMS,
  NORM_TYPES,
  type NormType,
} from "./config";
import type { BlockDTO, NormProgress } from "./types";

// ───────── Геометрия времени ↔ пиксели ─────────

export function minToY(min: number): number {
  return ((min - DAY_START_MIN) / 60) * HOUR_HEIGHT;
}

export function yToMin(y: number): number {
  return DAY_START_MIN + (y / HOUR_HEIGHT) * 60;
}

export function snapMin(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

export function pxHeight(durationMin: number): number {
  return (durationMin / 60) * HOUR_HEIGHT;
}

// ───────── Форматирование ─────────

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} ч` : `${h} ч ${rest} мин`;
}

// ───────── Нормы (клиентский пересчёт для мгновенного отклика) ─────────

export function computeNorms(blocks: BlockDTO[]): NormProgress[] {
  return NORM_TYPES.map((type: NormType) => {
    const cfg = NORMS[type];
    const done = blocks.filter(
      (b) => b.kind === type && b.done && b.duration >= cfg.minDuration
    ).length;
    return {
      type,
      emoji: cfg.emoji,
      label: cfg.label,
      done,
      required: cfg.required,
      complete: done >= cfg.required,
    };
  });
}

// ───────── Свободное место в дне ─────────

// Максимальный непрерывный свободный интервал (минуты) в пределах дня
// с учётом уже стоящих блоков.
export function maxFreeGap(dayBlocks: BlockDTO[]): number {
  const busy = dayBlocks
    .map((b) => [b.start, b.start + b.duration] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let cursor = DAY_START_MIN;
  let best = 0;
  for (const [s, e] of busy) {
    if (s > cursor) best = Math.max(best, s - cursor);
    cursor = Math.max(cursor, e);
  }
  best = Math.max(best, DAY_END_MIN - cursor);
  return best;
}

// ───────── Звук при установке блока ─────────

let audioCtx: AudioContext | null = null;

export function playSnap() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    // короткий мягкий «чпок»: быстрый поднимающийся тон с мгновенным затуханием
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // звук — не критично
  }
}

// ───────── API ─────────

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Ошибка ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  week: (start: string) => req<import("./types").WeekBundle>(`/api/week?start=${start}`),
  createBlock: (data: Partial<BlockDTO>) =>
    req<BlockDTO>("/api/blocks", { method: "POST", body: JSON.stringify(data) }),
  updateBlock: (id: string, data: Partial<BlockDTO>) =>
    req<BlockDTO>(`/api/blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBlock: (id: string) =>
    req<{ ok: boolean }>(`/api/blocks/${id}`, { method: "DELETE" }),
  createTask: (data: { title: string; duration?: number | null }) =>
    req<import("./types").TaskDTO>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTask: (id: string, data: Record<string, unknown>) =>
    req<import("./types").TaskDTO>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTask: (id: string) =>
    req<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  dayOff: (date: string, dayOff: boolean) =>
    req<{ date: string; dayOff: boolean }>("/api/day-off", {
      method: "POST",
      body: JSON.stringify({ date, dayOff }),
    }),
  away: (startDate: string, endDate: string) =>
    req<import("./types").AwayDTO>("/api/away", {
      method: "POST",
      body: JSON.stringify({ startDate, endDate }),
    }),
  returnFromAway: (id: string) =>
    req<{ ok: boolean }>(`/api/away/${id}`, { method: "DELETE" }),
  stats: (month?: string) =>
    req<StatsDTO>(`/api/stats${month ? `?month=${month}` : ""}`),
  createTemplate: (data: Record<string, unknown>) =>
    req<import("./types").TemplateDTO>("/api/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    req<import("./types").TemplateDTO>(`/api/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: string) =>
    req<{ ok: boolean }>(`/api/templates/${id}`, { method: "DELETE" }),
};

export interface StatsDTO {
  month: string;
  label: string;
  atelier: { done: number; required: number };
  gym: { done: number; required: number };
  daysOff: number;
  totalBlocks: number;
  doneBlocks: number;
  plannedHours: number;
  weeks: { weekStart: string; label: string; atelier: number; gym: number; total: number }[];
}
