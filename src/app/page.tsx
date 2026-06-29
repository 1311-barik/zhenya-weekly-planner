import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getWeekBundle } from "@/lib/store";
import { todayKey } from "@/lib/week";
import Planner from "@/components/Planner";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthed())) {
    redirect("/login");
  }
  const today = todayKey();
  const initial = await getWeekBundle(today);
  return <Planner initial={initial} today={today} />;
}
