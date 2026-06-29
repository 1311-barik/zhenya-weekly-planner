import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { serializeTemplate } from "@/lib/store";
import { COLOR_KEYS, NORM_TYPES } from "@/lib/config";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const templates = await prisma.template.findMany({ orderBy: { order: "asc" } });
  return json(templates.map(serializeTemplate));
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim())
    return badRequest("Нужно название");
  if (!COLOR_KEYS.includes(body.color)) return badRequest("Неверный цвет");

  const max = await prisma.template.aggregate({ _max: { order: true } });
  const template = await prisma.template.create({
    data: {
      name: body.name.trim(),
      color: body.color,
      duration: typeof body.duration === "number" ? body.duration : 60,
      kind: NORM_TYPES.includes(body.kind) ? body.kind : null,
      recurDay: typeof body.recurDay === "number" ? body.recurDay : null,
      recurStart: typeof body.recurStart === "number" ? body.recurStart : null,
      order: (max._max.order ?? 0) + 1,
    },
  });
  return json(serializeTemplate(template), 201);
}
