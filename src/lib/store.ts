import type { Block, Task, Template, AwayPeriod } from "@prisma/client";
import { prisma } from "./prisma";
import {
  NORMS,
  NORM_TYPES,
  RECURRING_EVENTS,
  type ColorKey,
  type NormType,
} from "./config";
import type {
  BlockDTO,
  TaskDTO,
  TemplateDTO,
  AwayDTO,
  NormProgress,
  WeekBundle,
} from "./types";
import {
  addDays,
  fromDateKey,
  startOfWeek,
  toDateKey,
  weekDates,
  type DateKey,
} from "./week";

// ───────── Сериализация Prisma → DTO ─────────

export function serializeBlock(b: Block): BlockDTO {
  return {
    id: b.id,
    title: b.title,
    color: b.color as ColorKey,
    date: toDateKey(b.date),
    start: b.start,
    duration: b.duration,
    done: b.done,
    recurring: b.recurring,
    kind: (b.kind as NormType | null) ?? null,
    templateId: b.templateId,
  };
}

export function serializeTask(t: Task): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    duration: t.duration,
    preferredDate: t.preferredDate ? toDateKey(t.preferredDate) : null,
    done: t.done,
    order: t.order,
  };
}

export function serializeTemplate(t: Template): TemplateDTO {
  return {
    id: t.id,
    name: t.name,
    color: t.color as ColorKey,
    duration: t.duration,
    kind: (t.kind as NormType | null) ?? null,
    recurDay: t.recurDay,
    recurStart: t.recurStart,
    order: t.order,
  };
}

export function serializeAway(a: AwayPeriod): AwayDTO {
  return {
    id: a.id,
    startDate: toDateKey(a.startDate),
    endDate: toDateKey(a.endDate),
  };
}

// ───────── Нормы недели ─────────

function computeNorms(blocks: Block[]): NormProgress[] {
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

// ───────── Авто-расстановка повторяющихся блоков ─────────

// Пересекается ли неделя с каким-либо периодом отъезда.
function weekIsAway(weekStart: Date, away: AwayPeriod[]): boolean {
  const weekEnd = addDays(weekStart, 6);
  return away.some((a) => a.startDate <= weekEnd && a.endDate >= weekStart);
}

async function ensureRecurring(weekStart: Date, away: AwayPeriod[]): Promise<void> {
  const seeded = await prisma.weekSeed.findUnique({
    where: { weekStart },
  });
  if (seeded) return;
  if (weekIsAway(weekStart, away)) {
    // На неделе отъезда постоянные события пропускаются.
    await prisma.weekSeed.create({ data: { weekStart } });
    return;
  }

  for (const ev of RECURRING_EVENTS) {
    await prisma.block.create({
      data: {
        title: ev.title,
        color: ev.color,
        date: addDays(weekStart, ev.day),
        start: ev.start,
        duration: ev.duration,
        recurring: true,
        kind: ev.kind ?? null,
      },
    });
  }
  await prisma.weekSeed.create({ data: { weekStart } });
}

// ───────── Главный бандл недели ─────────

export async function getWeekBundle(startKey: DateKey): Promise<WeekBundle> {
  const weekStart = startOfWeek(fromDateKey(startKey));
  const weekEnd = addDays(weekStart, 7); // эксклюзивно

  const [templates, away] = await Promise.all([
    prisma.template.findMany({ orderBy: { order: "asc" } }),
    prisma.awayPeriod.findMany(),
  ]);

  await ensureRecurring(weekStart, away);

  const [blocks, tasks, dayStates] = await Promise.all([
    prisma.block.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      orderBy: { start: "asc" },
    }),
    prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.dayState.findMany({
      where: { date: { gte: weekStart, lt: weekEnd }, dayOff: true },
    }),
  ]);

  return {
    weekStart: toDateKey(weekStart),
    days: weekDates(weekStart).map(toDateKey),
    blocks: blocks.map(serializeBlock),
    tasks: tasks.map(serializeTask),
    templates: templates.map(serializeTemplate),
    dayOff: dayStates.map((d) => toDateKey(d.date)),
    away: away.map(serializeAway),
    norms: computeNorms(blocks),
  };
}
