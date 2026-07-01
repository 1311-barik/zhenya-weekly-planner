import { getWeekBundle } from "@/lib/store";
import { fromDateKey, todayKey, formatWeekTitle, startOfWeek } from "@/lib/week";
import {
  DAY_START_HOUR,
  DAY_END_HOUR,
  DAY_START_MIN,
  HOUR_HEIGHT,
  WEEKDAYS_SHORT,
} from "@/lib/config";
import { formatTime, formatDuration } from "@/lib/client";

export const dynamic = "force-dynamic";

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
);
const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;

export default async function PrintPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await props.searchParams;
  const weekParam =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayKey();
  const bundle = await getWeekBundle(weekParam);
  const weekStart = startOfWeek(fromDateKey(bundle.weekStart));
  const dayOff = new Set(bundle.dayOff);

  const blocksByDay: Record<string, typeof bundle.blocks> = {};
  for (const d of bundle.days) blocksByDay[d] = [];
  for (const b of bundle.blocks) (blocksByDay[b.date] ??= []).push(b);

  return (
    <div className="print-page" id="print-root">
      <div className="print-head">
        <div className="app-logo">
          sheyn&apos;s <span>plan</span>
          <em>ner</em>
        </div>
        <div className="print-week-title serif">{formatWeekTitle(weekStart)}</div>
      </div>

      <div className="print-grid">
        <div className="days-header">
          <div style={{ borderRight: "1px solid rgba(196,189,180,0.2)" }} />
          {bundle.days.map((dayKey, i) => {
            const off = dayOff.has(dayKey);
            return (
              <div key={dayKey} className={`day-header${off ? " holiday" : ""}`}>
                <div className="day-name">{WEEKDAYS_SHORT[i]}</div>
                <div className="day-number">{fromDateKey(dayKey).getUTCDate()}</div>
                {off && <div className="holiday-badge">выходной</div>}
              </div>
            );
          })}
        </div>

        <div className="time-grid" style={{ height: GRID_HEIGHT }}>
          <div className="time-col">
            {HOURS.map((h) => (
              <div key={h} className="time-slot">
                <span className="time-label">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {bundle.days.map((dayKey) => {
            const off = dayOff.has(dayKey);
            return (
              <div key={dayKey} className={`day-col${off ? " holiday-col" : ""}`}>
                {HOURS.map((h) => (
                  <div key={h} className="hour-line" />
                ))}
                {(blocksByDay[dayKey] ?? []).map((b) => {
                  const top = ((b.start - DAY_START_MIN) / 60) * HOUR_HEIGHT;
                  const height = Math.max((b.duration / 60) * HOUR_HEIGHT, 26);
                  return (
                    <div
                      key={b.id}
                      className={`task-block block-${b.color}${b.done ? " done-block" : ""}`}
                      style={{ top, height, left: 3, right: 3 }}
                    >
                      <div className="task-block-title">{b.title}</div>
                      <div className="task-block-time">
                        {formatTime(b.start)} · {formatDuration(b.duration)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
