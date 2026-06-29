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
  NORM_TYPES,
  SLOT_MINUTES,
} from "@/lib/config";

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
  if (body.kind === null || NORM_TYPES.includes(body.kind)) data.kind = body.kind ?? null;
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
