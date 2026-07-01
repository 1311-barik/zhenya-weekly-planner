import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { serializeAway } from "@/lib/store";
import { addDays, fromDateKey, startOfWeek } from "@/lib/week";
import { DAY_START_MIN, DAY_END_MIN } from "@/lib/config";

// Активировать режим отъезда: на дни диапазона ставим ✈️ Отъезд,
// всё остальное в этих днях убираем.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const ok =
    body &&
    typeof body.startDate === "string" &&
    typeof body.endDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.endDate);
  if (!ok) return badRequest("Нужны корректные startDate и endDate");

  const start = fromDateKey(body.startDate);
  const end = fromDateKey(body.endDate);
  if (end < start) return badRequest("Дата возвращения раньше даты отъезда");

  const rangeEnd = addDays(end, 1); // эксклюзивная граница

  const away = await prisma.$transaction(async (tx) => {
    // Убираем все блоки в диапазоне.
    await tx.block.deleteMany({ where: { date: { gte: start, lt: rangeEnd } } });

    // Сбрасываем маркеры засева недель, затронутых отъездом.
    let ws = startOfWeek(start);
    const lastWeek = startOfWeek(end);
    while (ws <= lastWeek) {
      await tx.weekSeed.deleteMany({ where: { weekStart: ws } });
      ws = addDays(ws, 7);
    }

    // На каждый день диапазона: блок ✈️ Отъезд + пометка «выходной»
    // (отъезд = отдых, дни обязательно выходные).
    for (let d = new Date(start); d < rangeEnd; d = addDays(d, 1)) {
      const day = new Date(d);
      await tx.block.create({
        data: {
          title: "✈️ Отъезд",
          color: "blue",
          date: day,
          start: DAY_START_MIN,
          duration: DAY_END_MIN - DAY_START_MIN,
        },
      });
      await tx.dayState.upsert({
        where: { date: day },
        create: { date: day, dayOff: true },
        update: { dayOff: true },
      });
    }

    return tx.awayPeriod.create({ data: { startDate: start, endDate: end } });
  });

  return json(serializeAway(away), 201);
}
