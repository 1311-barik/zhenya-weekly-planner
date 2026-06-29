"use client";

import { useMemo, useState } from "react";
import type { WeekBundle } from "@/lib/types";
import { WEEKDAYS_SHORT } from "@/lib/config";
import { formatDuration, formatTime } from "@/lib/client";
import { fromDateKey } from "@/lib/week";

interface Props {
  bundle: WeekBundle;
  onRemoveBlocks: (ids: string[]) => Promise<void>;
  onAddTask: (title: string) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onApplyDayOff: (dayKey: string | null) => Promise<void>;
  onFinish: () => void;
  onClose: () => void;
}

export default function WeekWizard({
  bundle,
  onRemoveBlocks,
  onAddTask,
  onRemoveTask,
  onApplyDayOff,
  onFinish,
  onClose,
}: Props) {
  const [step, setStep] = useState(1);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [taskInput, setTaskInput] = useState("");
  const [busy, setBusy] = useState(false);

  const existingDayOff = bundle.dayOff.find((d) => bundle.days.includes(d)) ?? null;
  const [selectedDayOff, setSelectedDayOff] = useState<string | null>(existingDayOff);

  // Постоянные (переходящие) события — блоки с флагом recurring.
  const recurringBlocks = useMemo(
    () =>
      bundle.blocks
        .filter((b) => b.recurring)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [bundle.blocks]
  );

  const dayShort = (dateKey: string) =>
    WEEKDAYS_SHORT[(fromDateKey(dateKey).getUTCDay() + 6) % 7];

  function toggleRemoved(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function next() {
    if (busy) return;
    if (step === 1) {
      // применяем удаление снятых постоянных событий
      if (removed.size > 0) {
        setBusy(true);
        await onRemoveBlocks([...removed]);
        setRemoved(new Set());
        setBusy(false);
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function addTask() {
    const t = taskInput.trim();
    if (!t || busy) return;
    setBusy(true);
    await onAddTask(t);
    setTaskInput("");
    setBusy(false);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    // выходной: применяем, только если изменилось
    if (selectedDayOff !== existingDayOff) {
      await onApplyDayOff(selectedDayOff);
    }
    setBusy(false);
    onFinish();
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup wizard" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">Собрать неделю</div>

        <div className="wizard-steps">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`wizard-dot${s === step ? " active" : ""}${
                s < step ? " done" : ""
              }`}
            />
          ))}
        </div>

        {/* ШАГ 1 — постоянные события */}
        {step === 1 && (
          <>
            <div className="wizard-step-label">Шаг 1 из 3 · Постоянные события</div>
            <p className="wizard-intro">
              Это переходящие из недели в неделю события, привязанные ко времени — я уже
              расставил их. Всё в силе на этой неделе? Сними то, чего не будет.
            </p>
            <div className="wizard-body">
              {recurringBlocks.length === 0 && (
                <p className="wizard-row-sub">Постоянных событий на этой неделе нет.</p>
              )}
              {recurringBlocks.map((b) => {
                const off = removed.has(b.id);
                return (
                  <div key={b.id} className={`wizard-row${off ? " removed" : ""}`}>
                    <div className="wizard-row-main">
                      {b.title}
                      <div className="wizard-row-sub">
                        {dayShort(b.date)} · {formatTime(b.start)} · {formatDuration(b.duration)}
                      </div>
                    </div>
                    <button
                      className={`wizard-row-btn${off ? " restore" : ""}`}
                      onClick={() => toggleRemoved(b.id)}
                    >
                      {off ? "Вернуть" : "Не будет"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ШАГ 2 — разовые дела */}
        {step === 2 && (
          <>
            <div className="wizard-step-label">Шаг 2 из 3 · Разовые дела</div>
            <p className="wizard-intro">
              Что уже запланировано на эту неделю? Врачи, маникюр, встречи, поездки…
              Добавь в список — потом перетащишь в нужный день.
            </p>
            <div className="wizard-add-row">
              <input
                className="form-input"
                placeholder="Например, врач во вторник"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
              />
              <button className="btn-primary" onClick={addTask}>
                +
              </button>
            </div>
            <div className="wizard-body">
              {bundle.tasks.length === 0 && (
                <p className="wizard-row-sub">Пока пусто — можно пропустить.</p>
              )}
              {bundle.tasks.map((t) => (
                <div key={t.id} className="wizard-row">
                  <div className="wizard-row-main">{t.title}</div>
                  <button className="wizard-row-btn" onClick={() => onRemoveTask(t.id)}>
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ШАГ 3 — выходной */}
        {step === 3 && (
          <>
            <div className="wizard-step-label">Шаг 3 из 3 · Выходной</div>
            <p className="wizard-intro">
              Хотя бы один выходной на неделе — это важно 💛 Выбери день, и он останется
              свободным. Или можно без выходного — но попробуй всё-таки оставить себе паузу.
            </p>
            <div className="wizard-dayoff-grid">
              {bundle.days.map((dayKey, i) => (
                <div
                  key={dayKey}
                  className={`wizard-day${selectedDayOff === dayKey ? " selected" : ""}`}
                  onClick={() =>
                    setSelectedDayOff(selectedDayOff === dayKey ? null : dayKey)
                  }
                >
                  <div className="wizard-day-name">{WEEKDAYS_SHORT[i]}</div>
                  <div className="wizard-day-num">{fromDateKey(dayKey).getUTCDate()}</div>
                </div>
              ))}
            </div>
            {selectedDayOff === null && (
              <p className="wizard-row-sub" style={{ marginBottom: 12 }}>
                Сейчас выбрано: без выходного на этой неделе.
              </p>
            )}
          </>
        )}

        {/* НАВИГАЦИЯ */}
        <div className="wizard-actions">
          {step > 1 ? (
            <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              Назад
            </button>
          ) : (
            <button className="btn-ghost" onClick={onClose}>
              Отмена
            </button>
          )}
          {step < 3 ? (
            <button className="btn-primary" onClick={next} disabled={busy}>
              Дальше
            </button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={busy}>
              Готово → расставить блоки
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
