import type { NextRequest } from "next/server";
import { getWeekBundle } from "@/lib/store";
import { guard, json, badRequest } from "@/lib/http";
import { todayKey } from "@/lib/week";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const start = req.nextUrl.searchParams.get("start") || todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return badRequest("Параметр start должен быть в формате YYYY-MM-DD");
  }
  const bundle = await getWeekBundle(start);
  return json(bundle);
}
