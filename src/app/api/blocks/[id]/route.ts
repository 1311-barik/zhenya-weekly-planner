import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest, notFound } from "@/lib/http";
import { serializeBlock } from "@/lib/store";
import { fromDateKey } from "@/lib/week";
import {
  COLOR_KEYS,
  DAY_START_MIN,
  DAY_END_MIN,
  MIN_BLOCK_MINUTES,
  SLOT_MINUTES,
  NORM_LATEST_END_MIN,
} from "@/lib/config";
import { findOverlap, findSameNorm, isNormKind } from "@/lib/blockRules";

function snap(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const existing = await prisma.block.findUnique({ where: { id } });
  if (!existing) return notFound("Блок не найден");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Пустое тело запроса");

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (COLOR_KEYS.includes(body.color)) data.color = body.color;
  if (typeof body.done === "boolean") data.done = body.done;
  if (body.kind === null || isNormKind(body.kind)) data.kind = body.kind ?? null;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date))
    data.date = fromDateKey(body.date);

  // Время/длительность с привязкой к сетке и границам дня.
  const nextStart =
    typeof body.start === "number"
      ? Math.min(Math.max(snap(body.start), DAY_START_MIN), DAY_END_MIN - MIN_BLOCK_MINUTES)
      : existing.start;
  if (typeof body.start === "number") data.start = nextStart;

  if (typeof body.duration === "number") {
    const dur = Math.max(snap(body.duration), MIN_BLOCK_MINUTES);
    data.duration = Math.min(dur, DAY_END_MIN - nextStart);
  }

  if (Object.keys(data).length === 0) return badRequest("Нет полей для обновления");

  const nextDate = (data.date as Date | undefined) ?? existing.date;
  const nextDuration = (data.duration as number | undefined) ?? existing.duration;
  const nextKind = (data.kind as string | null | undefined) ?? existing.kind;

  const dayState = await prisma.dayState.findUnique({ where: { date: nextDate } });
  if (dayState?.dayOff) {
    return badRequest("Это выходной день, давай оставим его свободным");
  }

  const sameDayBlocks = await prisma.block.findMany({
    where: { date: nextDate },
    select: { id: true, start: true, duration: true, kind: true },
  });
  if (findOverlap(sameDayBlocks, nextStart, nextDuration, id)) {
    return badRequest("Женя, блоки не могут пересекаться по времени");
  }
  if (findSameNorm(sameDayBlocks, nextKind, id)) {
    return badRequest("Женя, в этот день такой любимый блок уже стоит");
  }
  if (isNormKind(nextKind) && nextStart + nextDuration > NORM_LATEST_END_MIN) {
    return badRequest("Женя, ателье и спорт нужно закончить до 19:00");
  }

  const block = await prisma.block.update({ where: { id }, data });
  return json(serializeBlock(block));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  await prisma.block.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
