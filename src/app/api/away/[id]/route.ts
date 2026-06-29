import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, notFound } from "@/lib/http";
import { addDays } from "@/lib/week";

type Ctx = { params: Promise<{ id: string }> };

// «Я вернулась»: снять режим отъезда и убрать блоки ✈️ Отъезд.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const period = await prisma.awayPeriod.findUnique({ where: { id } });
  if (!period) return notFound("Период отъезда не найден");

  const rangeEnd = addDays(period.endDate, 1);
  await prisma.$transaction([
    prisma.block.deleteMany({
      where: {
        date: { gte: period.startDate, lt: rangeEnd },
        title: "✈️ Отъезд",
      },
    }),
    prisma.awayPeriod.delete({ where: { id } }),
  ]);

  return json({ ok: true });
}
