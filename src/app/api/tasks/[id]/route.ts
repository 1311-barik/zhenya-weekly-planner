import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest, notFound } from "@/lib/http";
import { serializeTask } from "@/lib/store";
import { fromDateKey } from "@/lib/week";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("Задача не найдена");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Пустое тело запроса");

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.order === "number") data.order = body.order;
  if (body.duration === null || typeof body.duration === "number")
    data.duration = body.duration;
  if (body.preferredDate === null) data.preferredDate = null;
  else if (typeof body.preferredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate))
    data.preferredDate = fromDateKey(body.preferredDate);

  if (Object.keys(data).length === 0) return badRequest("Нет полей для обновления");

  const task = await prisma.task.update({ where: { id }, data });
  return json(serializeTask(task));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await prisma.task.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
