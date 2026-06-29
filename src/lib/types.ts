import type { ColorKey, NormType } from "./config";
import type { DateKey } from "./week";

export interface BlockDTO {
  id: string;
  title: string;
  color: ColorKey;
  date: DateKey;
  start: number; // минуты от полуночи
  duration: number; // минуты
  done: boolean;
  recurring: boolean;
  kind: NormType | null;
  templateId: string | null;
}

export interface TaskDTO {
  id: string;
  title: string;
  duration: number | null;
  preferredDate: DateKey | null;
  done: boolean;
  order: number;
}

export interface TemplateDTO {
  id: string;
  name: string;
  color: ColorKey;
  duration: number;
  kind: NormType | null;
  recurDay: number | null;
  recurStart: number | null;
  order: number;
}

export interface AwayDTO {
  id: string;
  startDate: DateKey;
  endDate: DateKey;
}

export interface NormProgress {
  type: NormType;
  emoji: string;
  label: string;
  done: number;
  required: number;
  complete: boolean;
}

export interface WeekBundle {
  weekStart: DateKey;
  days: DateKey[];
  blocks: BlockDTO[];
  tasks: TaskDTO[];
  templates: TemplateDTO[];
  dayOff: DateKey[];
  away: AwayDTO[];
  norms: NormProgress[];
}
