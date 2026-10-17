const KEY = (packId: string) => `spot:hs:${packId}`;

/**
 * Packs renamed when the menu started being generated from aircraft attributes:
 * new id -> the old id whose best score it inherits. Old scores are read, never
 * deleted, so this is safe to keep.
 */
const PREVIOUS_IDS: Record<string, string> = {
  "military-role-fighters": "fighter-jets",
  "military-role-helicopters": "helicopters",
  "military-role-bombers": "bombers",
  "military-role-transports": "military-support",
  "military-era-wwii": "ww2-warbirds",
  "military-country-soviet-union-and-russia": "soviet-russian",
  "civil-airliners-narrowbody": "narrowbody-airliners",
  "civil-airliners-regional": "regional-airliners",
  "civil-business-general-aviation": "general-aviation",
};

function read(packId: string): number | null {
  try {
    const v = localStorage.getItem(KEY(packId));
    return v !== null ? Number(v) : null;
  } catch {
    return null;
  }
}

export function getHighScore(packId: string): number | null {
  const own = read(packId);
  if (own !== null) return own;
  const previous = PREVIOUS_IDS[packId];
  return previous ? read(previous) : null;
}

export function setHighScore(packId: string, score: number): void {
  const prev = getHighScore(packId);
  if (prev === null || score > prev) {
    try {
      localStorage.setItem(KEY(packId), String(score));
    } catch {
      // Storage unavailable: the game still works, the score just isn't kept.
    }
  }
}
