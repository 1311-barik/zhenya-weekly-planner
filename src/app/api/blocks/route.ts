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
  NORM_TYPES,
  SLOT_MINUTES,
} from "@/lib/config";

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
    return badRequest("Это выходной день — новые блоки не добавляются");
  }

  const snappedStart = Math.min(
    Math.max(snap(start), DAY_START_MIN),
    DAY_END_MIN - MIN_BLOCK_MINUTES
  );
  const snappedDur = Math.max(
    snap(duration),
    MIN_BLOCK_MINUTES
  );

  const block = await prisma.block.create({
    data: {
      title: title.trim(),
      color,
      date: fromDateKey(date),
      start: snappedStart,
      duration: Math.min(snappedDur, DAY_END_MIN - snappedStart),
      kind: NORM_TYPES.includes(kind) ? kind : null,
      templateId: typeof templateId === "string" ? templateId : null,
    },
  });

  return json(serializeBlock(block), 201);
}
