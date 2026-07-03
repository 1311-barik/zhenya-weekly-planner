import { NORM_TYPES, type NormType } from "./config";

export type RuleBlock = {
  id: string;
  start: number;
  duration: number;
  kind: string | null;
};

export function isNormKind(kind: unknown): kind is NormType {
  return typeof kind === "string" && NORM_TYPES.includes(kind as NormType);
}

export function blocksOverlap(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number
) {
  return aStart < bStart + bDuration && aStart + aDuration > bStart;
}

export function findOverlap(
  blocks: RuleBlock[],
  start: number,
  duration: number,
  excludeId?: string
) {
  return blocks.find(
    (block) =>
      block.id !== excludeId &&
      blocksOverlap(start, duration, block.start, block.duration)
  );
}

export function findSameNorm(
  blocks: RuleBlock[],
  kind: string | null | undefined,
  excludeId?: string
) {
  if (!isNormKind(kind)) return undefined;
  return blocks.find((block) => block.id !== excludeId && block.kind === kind);
}

