import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest, notFound } from "@/lib/http";
import { serializeTemplate } from "@/lib/store";
import { COLOR_KEYS, NORM_TYPES } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) return notFound("Шаблон не найден");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Пустое тело запроса");

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (COLOR_KEYS.includes(body.color)) data.color = body.color;
  if (typeof body.duration === "number" && body.duration > 0) data.duration = body.duration;
  if (body.kind === null || NORM_TYPES.includes(body.kind)) data.kind = body.kind ?? null;
  if (typeof body.order === "number") data.order = body.order;

  if (Object.keys(data).length === 0) return badRequest("Нет полей для обновления");

  const template = await prisma.template.update({ where: { id }, data });
  return json(serializeTemplate(template));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await prisma.template.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
