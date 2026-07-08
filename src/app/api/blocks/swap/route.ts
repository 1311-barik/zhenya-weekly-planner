import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest, notFound } from "@/lib/http";
import { serializeBlock } from "@/lib/store";
import { findOverlap, findSameNorm } from "@/lib/blockRules";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.aId !== "string" || typeof body.bId !== "string") {
    return badRequest("Нужны aId и bId");
  }
  if (body.aId === body.bId) return badRequest("Нужны два разных блока");

  const [a, b] = await Promise.all([
    prisma.block.findUnique({ where: { id: body.aId } }),
    prisma.block.findUnique({ where: { id: body.bId } }),
  ]);
  if (!a || !b) return notFound("Блок не найден");

  const nextA = { date: b.date, start: b.start, duration: a.duration, kind: a.kind };
  const nextB = { date: a.date, start: a.start, duration: b.duration, kind: b.kind };

  const [aDayOff, bDayOff, aDayBlocks, bDayBlocks] = await Promise.all([
    prisma.dayState.findUnique({ where: { date: nextA.date } }),
    prisma.dayState.findUnique({ where: { date: nextB.date } }),
    prisma.block.findMany({
      where: { date: nextA.date },
      select: { id: true, start: true, duration: true, kind: true },
    }),
    prisma.block.findMany({
      where: { date: nextB.date },
      select: { id: true, start: true, duration: true, kind: true },
    }),
  ]);

  if (aDayOff?.dayOff || bDayOff?.dayOff) {
    return badRequest("Это выходной день, давай оставим его свободным");
  }
  if (
    nextA.date.getTime() === nextB.date.getTime() &&
    nextA.start < nextB.start + nextB.duration &&
    nextA.start + nextA.duration > nextB.start
  ) {
    return badRequest("Женя, эти блоки не получится поменять местами без пересечения");
  }

  const ids = new Set([a.id, b.id]);
  const aOthers = aDayBlocks.filter((block) => !ids.has(block.id));
  const bOthers = bDayBlocks.filter((block) => !ids.has(block.id));

  if (findOverlap(aOthers, nextA.start, nextA.duration)) {
    return badRequest("Женя, блоки не могут пересекаться по времени");
  }
  if (findOverlap(bOthers, nextB.start, nextB.duration)) {
    return badRequest("Женя, блоки не могут пересекаться по времени");
  }
  if (findSameNorm(aOthers, nextA.kind) || findSameNorm(bOthers, nextB.kind)) {
    return badRequest("Женя, в этот день такой любимый блок уже стоит");
  }

  const [updatedA, updatedB] = await prisma.$transaction([
    prisma.block.update({
      where: { id: a.id },
      data: { date: nextA.date, start: nextA.start },
    }),
    prisma.block.update({
      where: { id: b.id },
      data: { date: nextB.date, start: nextB.start },
    }),
  ]);

  return json({ blocks: [serializeBlock(updatedA), serializeBlock(updatedB)] });
}
