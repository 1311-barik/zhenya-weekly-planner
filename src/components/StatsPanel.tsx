"use client";

import { useEffect, useState } from "react";
import { api, type StatsDTO } from "@/lib/client";

function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function StatsPanel({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<StatsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .stats(month)
      .then((d) => {
        if (active) {
          setData(d);
          setMonth(d.month);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  const changeMonth = (next: string) => {
    if (next === month) return;
    setLoading(true);
    setMonth(next);
  };

  const maxWeekTotal = data ? Math.max(1, ...data.weeks.map((w) => w.total)) : 1;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup stats-popup" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <button className="nav-btn" onClick={() => data && changeMonth(prevMonth(data.month))}>
            ‹
          </button>
          <div className="popup-title serif" style={{ margin: 0 }}>
            {data ? data.label : "Статистика"}
          </div>
          <button className="nav-btn" onClick={() => data && changeMonth(nextMonth(data.month))}>
            ›
          </button>
        </div>

        {loading && !data ? (
          <p className="wizard-row-sub" style={{ padding: "20px 0" }}>
            Загрузка…
          </p>
        ) : data ? (
          <>
            <div className="stats-cards">
              <div className="stat-card">
                <div className="stat-num">
                  🧵 {data.atelier.done}
                </div>
                <div className="stat-label">Ателье (по норме)</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">🏋️ {data.gym.done}</div>
                <div className="stat-label">Спорт (по норме)</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">🌿 {data.daysOff}</div>
                <div className="stat-label">Выходных</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">
                  ✓ {data.doneBlocks}/{data.totalBlocks}
                </div>
                <div className="stat-label">Выполнено блоков</div>
              </div>
            </div>

            <div className="stats-sub">
              Запланировано часов за месяц: <b>{data.plannedHours}</b>
            </div>

            {data.weeks.length > 0 && (
              <div className="stats-weeks">
                <div className="sidebar-section-title" style={{ marginBottom: 8 }}>
                  По неделям
                </div>
                {data.weeks.map((w) => (
                  <div key={w.weekStart} className="stats-week-row">
                    <span className="stats-week-label">{w.label}</span>
                    <div className="stats-bar-track">
                      <div
                        className="stats-bar"
                        style={{ width: `${(w.total / maxWeekTotal) * 100}%` }}
                      />
                    </div>
                    <span className="stats-week-num">
                      {w.atelier > 0 && `🧵${w.atelier} `}
                      {w.gym > 0 && `🏋️${w.gym} `}
                      {w.total}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="stats-actions">
              <a className="btn-ghost" href="/api/export" download>
                ⬇ Экспорт в JSON
              </a>
              <button className="btn-primary" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </>
        ) : (
          <p className="wizard-row-sub">Не удалось загрузить.</p>
        )}
      </div>
    </div>
  );
}
