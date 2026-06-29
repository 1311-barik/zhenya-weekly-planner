import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { NORMS, NORM_TYPES } from "@/lib/config";
import { addDays, startOfWeek, toDateKey } from "@/lib/week";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const monthParam = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (monthParam) {
    const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (!m) return badRequest("month должен быть в формате YYYY-MM");
    year = Number(m[1]);
    month = Number(m[2]) - 1;
  }

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1)); // эксклюзивно

  const [blocks, dayStates] = await Promise.all([
    prisma.block.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.dayState.findMany({
      where: { date: { gte: monthStart, lt: monthEnd }, dayOff: true },
    }),
  ]);

  // Зачёт нормы: выполнено и достаточная длительность.
  const normDone = (type: (typeof NORM_TYPES)[number]) =>
    blocks.filter(
      (b) => b.kind === type && b.done && b.duration >= NORMS[type].minDuration
    ).length;

  const doneBlocks = blocks.filter((b) => b.done).length;
  const plannedMinutes = blocks.reduce((s, b) => s + b.duration, 0);

  // Разбивка по неделям месяца (по понедельникам).
  const weekMap = new Map<string, { atelier: number; gym: number; total: number }>();
  for (const b of blocks) {
    const wk = toDateKey(startOfWeek(b.date));
    const cur = weekMap.get(wk) ?? { atelier: 0, gym: 0, total: 0 };
    cur.total += 1;
    for (const t of NORM_TYPES) {
      if (b.kind === t && b.done && b.duration >= NORMS[t].minDuration) cur[t] += 1;
    }
    weekMap.set(wk, cur);
  }
  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => {
      const end = addDays(new Date(weekStart), 6);
      return {
        weekStart,
        label: `${new Date(weekStart).getUTCDate()}–${end.getUTCDate()}`,
        ...v,
      };
    });

  return json({
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${MONTHS[month]} ${year}`,
    atelier: { done: normDone("atelier"), required: NORMS.atelier.required },
    gym: { done: normDone("gym"), required: NORMS.gym.required },
    daysOff: dayStates.length,
    totalBlocks: blocks.length,
    doneBlocks,
    plannedHours: Math.round((plannedMinutes / 60) * 10) / 10,
    weeks,
  });
}
