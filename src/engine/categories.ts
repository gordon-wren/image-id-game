import type { QuestionPack } from "./types";

export interface PackCategory {
  /** Stable slug derived from the category title, e.g. "aviation". */
  id: string;
  /** Display title, e.g. "Aviation". */
  title: string;
  /** First non-empty `categoryDescription` found among its packs, if any. */
  description?: string;
  packs: QuestionPack[];
}

export function slugifyCategory(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Groups packs by their `category` field, preserving first-seen order. Uncategorized packs land under "Other". */
export function groupPacksByCategory(packs: QuestionPack[]): PackCategory[] {
  const groups = new Map<string, PackCategory>();
  for (const pack of packs) {
    const title = pack.category ?? "Other";
    const id = slugifyCategory(title);
    let group = groups.get(id);
    if (!group) {
      group = { id, title, packs: [] };
      groups.set(id, group);
    }
    if (!group.description && pack.categoryDescription) {
      group.description = pack.categoryDescription;
    }
    group.packs.push(pack);
  }
  return [...groups.values()];
}

/** The category id a pack belongs to, matching `groupPacksByCategory`'s slugs. */
export function categoryIdForPack(pack: QuestionPack): string {
  return slugifyCategory(pack.category ?? "Other");
}
