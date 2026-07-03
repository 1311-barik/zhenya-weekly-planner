import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { serializeBlock } from "@/lib/store";
import { fromDateKey } from "@/lib/week";
import {
  COLOR_KEYS,
  DAY_START_MIN,
  DAY_END_MIN,
  MIN_BLOCK_MINUTES,
  SLOT_MINUTES,
} from "@/lib/config";
import { findOverlap, findSameNorm, isNormKind } from "@/lib/blockRules";

function snap(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Пустое тело запроса");

  const { title, color, date, start, duration, kind, templateId } = body;

  if (typeof title !== "string" || !title.trim()) return badRequest("Нужно название");
  if (!COLOR_KEYS.includes(color)) return badRequest("Неверный цвет");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return badRequest("Неверная дата");
  if (typeof start !== "number" || typeof duration !== "number")
    return badRequest("start и duration должны быть числами");

  // Запрет добавления в выходной день.
  const dayState = await prisma.dayState.findUnique({ where: { date: fromDateKey(date) } });
  if (dayState?.dayOff) {
    return badRequest("Это выходной день, давай оставим его свободным");
  }

  const snappedStart = Math.min(
    Math.max(snap(start), DAY_START_MIN),
    DAY_END_MIN - MIN_BLOCK_MINUTES
  );
  const snappedDur = Math.max(snap(duration), MIN_BLOCK_MINUTES);
  const nextDuration = Math.min(snappedDur, DAY_END_MIN - snappedStart);
  const nextKind = isNormKind(kind) ? kind : null;
  const sameDayBlocks = await prisma.block.findMany({
    where: { date: fromDateKey(date) },
    select: { id: true, start: true, duration: true, kind: true },
  });

  if (findOverlap(sameDayBlocks, snappedStart, nextDuration)) {
    return badRequest("Женя, блоки не могут пересекаться по времени");
  }
  if (findSameNorm(sameDayBlocks, nextKind)) {
    return badRequest("Женя, в этот день такой любимый блок уже стоит");
  }

  const block = await prisma.block.create({
    data: {
      title: title.trim(),
      color,
      date: fromDateKey(date),
      start: snappedStart,
      duration: nextDuration,
      kind: nextKind,
      templateId: typeof templateId === "string" ? templateId : null,
    },
  });

  return json(serializeBlock(block), 201);
}
