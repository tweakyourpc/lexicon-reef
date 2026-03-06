import type { Lexeme } from "../types";

function traceRoot(
  id: number,
  parentById: Map<number, number | null>,
  activeIds: Set<number>
): number | null {
  if (!activeIds.has(id)) {
    return null;
  }

  const seen = new Set<number>();
  let current = id;

  while (true) {
    if (seen.has(current)) {
      return current;
    }
    seen.add(current);

    const parentId = parentById.get(current);
    if (parentId === undefined || parentId === null) {
      return current;
    }
    if (!activeIds.has(parentId)) {
      return current;
    }
    current = parentId;
  }
}

export function computeLineageDepth(id: number, lexemes: readonly Lexeme[]): number {
  const parentById = new Map<number, number | null>();
  for (const lexeme of lexemes) {
    parentById.set(lexeme.id, lexeme.parentId);
  }
  if (!parentById.has(id)) {
    return 0;
  }

  const seen = new Set<number>();
  let depth = 0;
  let currentId = id;

  while (true) {
    if (seen.has(currentId)) {
      return depth;
    }
    seen.add(currentId);

    const parentId = parentById.get(currentId);
    if (parentId === undefined || parentId === null) {
      return depth;
    }
    depth += 1;
    currentId = parentId;
  }
}

export function dominantLineage(lexemes: readonly Lexeme[]): number | null {
  if (lexemes.length === 0) {
    return null;
  }

  const parentById = new Map<number, number | null>();
  const activeIds = new Set<number>();
  for (const lexeme of lexemes) {
    parentById.set(lexeme.id, lexeme.parentId);
    activeIds.add(lexeme.id);
  }

  const counts = new Map<number, number>();
  for (const lexeme of lexemes) {
    const root = traceRoot(lexeme.id, parentById, activeIds);
    if (root === null) {
      continue;
    }
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  let bestRoot: number | null = null;
  let bestCount = -1;
  for (const [root, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && bestRoot !== null && root < bestRoot)) {
      bestRoot = root;
      bestCount = count;
    }
  }

  return bestRoot;
}
