const KEY = (packId: string) => `spot:hs:${packId}`;

export function getHighScore(packId: string): number | null {
  const v = localStorage.getItem(KEY(packId));
  return v !== null ? Number(v) : null;
}

export function setHighScore(packId: string, score: number): void {
  const prev = getHighScore(packId);
  if (prev === null || score > prev) {
    localStorage.setItem(KEY(packId), String(score));
  }
}
