import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { addDays, fromDateKey, startOfWeek, toDateKey } from "@/lib/week";

// Тогл выходного дня. Не более 1 выходного в неделю.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))
    return badRequest("Неверная дата");

  const date = fromDateKey(body.date);
  const dayOff = Boolean(body.dayOff);

  if (dayOff) {
    // Проверяем, что в этой неделе ещё нет выходного.
    const weekStart = startOfWeek(date);
    const weekEnd = addDays(weekStart, 7);
    const existing = await prisma.dayState.findFirst({
      where: { date: { gte: weekStart, lt: weekEnd }, dayOff: true },
    });
    if (existing && toDateKey(existing.date) !== body.date) {
      return badRequest("В неделе уже есть выходной — снимите его сначала");
    }
  }

  await prisma.dayState.upsert({
    where: { date },
    create: { date, dayOff },
    update: { dayOff },
  });

  return json({ date: body.date, dayOff });
}
