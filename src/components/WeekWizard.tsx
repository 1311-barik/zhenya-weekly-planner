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
  onFinish: () => void;
  onClose: () => void;
}

export default function WeekWizard({
  bundle,
  onRemoveBlocks,
  onAddTask,
  onRemoveTask,
  onFinish,
  onClose,
}: Props) {
  const [step, setStep] = useState(1);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [taskInput, setTaskInput] = useState("");
  const [busy, setBusy] = useState(false);

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
      onFinish();
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

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup wizard" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">Собрать неделю</div>

        <div className="wizard-steps">
          {[1, 2].map((s) => (
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
            <div className="wizard-step-label">Шаг 1 из 2 · Постоянные события</div>
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
            <div className="wizard-step-label">Шаг 2 из 2 · Разовые дела</div>
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
          <button className="btn-primary" onClick={next} disabled={busy}>
            {step === 1 ? "Дальше" : "Готово → расставить блоки"}
          </button>
        </div>
      </div>
    </div>
  );
}
