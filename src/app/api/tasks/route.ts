import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, json, badRequest } from "@/lib/http";
import { serializeTask } from "@/lib/store";
import { fromDateKey } from "@/lib/week";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const tasks = await prisma.task.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim())
    return badRequest("Нужно название задачи");

  const max = await prisma.task.aggregate({ _max: { order: true } });
  const task = await prisma.task.create({
    data: {
      title: body.title.trim(),
      duration: typeof body.duration === "number" ? body.duration : null,
      preferredDate:
        typeof body.preferredDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate)
          ? fromDateKey(body.preferredDate)
          : null,
      order: (max._max.order ?? 0) + 1,
    },
  });
  return json(serializeTask(task), 201);
}
