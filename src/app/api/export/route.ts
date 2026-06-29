import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/http";
import { todayKey } from "@/lib/week";

// Полная выгрузка данных (резервная копия).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  const [templates, blocks, tasks, dayStates, away] = await Promise.all([
    prisma.template.findMany({ orderBy: { order: "asc" } }),
    prisma.block.findMany({ orderBy: [{ date: "asc" }, { start: "asc" }] }),
    prisma.task.findMany({ orderBy: { order: "asc" } }),
    prisma.dayState.findMany({ orderBy: { date: "asc" } }),
    prisma.awayPeriod.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  const payload = {
    app: "sheyn's planner",
    exportedAt: new Date().toISOString(),
    counts: {
      templates: templates.length,
      blocks: blocks.length,
      tasks: tasks.length,
      dayStates: dayStates.length,
      away: away.length,
    },
    templates,
    blocks,
    tasks,
    dayStates,
    away,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="planner-backup-${todayKey()}.json"`,
    },
  });
}
