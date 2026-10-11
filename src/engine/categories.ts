import type { QuestionPack } from "./types";

/**
 * A folder in the category tree. Folders can hold both sub-folders and packs,
 * so a pack can sit at any depth (e.g. "Aviation › Helicopters" alongside
 * "Aviation › Helicopters › Military").
 */
export interface CategoryNode {
  /** Slug of this segment, unique among its siblings, e.g. "helicopters". */
  id: string;
  /** Display title, e.g. "Helicopters". */
  title: string;
  /** Top-level categories only: first non-empty `categoryDescription` among their packs. */
  description?: string;
  children: CategoryNode[];
  packs: QuestionPack[];
}

export function slugifyCategory(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Display path for a pack: `path` if set, else `[category]`, else `["Other"]`. */
export function packPath(pack: QuestionPack): string[] {
  const path = pack.path?.map((s) => s.trim()).filter(Boolean);
  if (path && path.length > 0) return path;
  return [pack.category?.trim() || "Other"];
}

/** Slug path for a pack, matching the node ids produced by `buildCategoryTree`. */
export function packPathIds(pack: QuestionPack): string[] {
  return packPath(pack).map(slugifyCategory);
}

/**
 * Builds the category tree from each pack's path, preserving first-seen order.
 * Returns a synthetic root whose `children` are the top-level categories.
 */
export function buildCategoryTree(packs: QuestionPack[]): CategoryNode {
  const root: CategoryNode = { id: "", title: "", children: [], packs: [] };
  for (const pack of packs) {
    let node = root;
    for (const [depth, title] of packPath(pack).entries()) {
      const id = slugifyCategory(title);
      let child = node.children.find((c) => c.id === id);
      if (!child) {
        child = { id, title, children: [], packs: [] };
        node.children.push(child);
      }
      if (depth === 0 && !child.description && pack.categoryDescription) {
        child.description = pack.categoryDescription;
      }
      node = child;
    }
    node.packs.push(pack);
  }
  return root;
}

/**
 * Walks `ids` down from `root`, returning the chain of nodes visited
 * (starting with `root`). Stops early at the first id that doesn't match.
 */
export function nodeChain(root: CategoryNode, ids: string[]): CategoryNode[] {
  const chain = [root];
  for (const id of ids) {
    const next = chain[chain.length - 1].children.find((c) => c.id === id);
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

/** Total packs in a node's subtree. */
export function countPacks(node: CategoryNode): number {
  return node.packs.length + node.children.reduce((n, c) => n + countPacks(c), 0);
}

/** Accent of the first pack found in a node's subtree, for tinting folders. */
export function nodeAccent(node: CategoryNode): string | undefined {
  if (node.packs[0]) return node.packs[0].theme.accent;
  for (const child of node.children) {
    const accent = nodeAccent(child);
    if (accent) return accent;
  }
  return undefined;
}
