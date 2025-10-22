import type { OnlineMatchSummary } from '../state/types';

export function computeWinnerFromHistory(summary: OnlineMatchSummary): 'east' | 'west' | null {
  const hist = Array.isArray(summary.gamesHistory) ? summary.gamesHistory : [];
  if (!hist.length) return null;
  let eastWins = 0;
  let westWins = 0;
  for (const g of hist) {
    if (g.winner === 'east') eastWins++;
    else if (g.winner === 'west') westWins++;
  }
  if (eastWins === westWins) return null; // tie shouldn't happen; fallbacks apply
  return eastWins > westWins ? 'east' : 'west';
}

export function resolveWinnerSide(summary: OnlineMatchSummary): 'east' | 'west' {
  // Prefer authoritative history count
  const fromHistory = computeWinnerFromHistory(summary);
  if (fromHistory) return fromHistory;

  // Next, trust provided summary.winner when valid
  if (summary.winner === 'east' || summary.winner === 'west') return summary.winner;

  // As a last fallback, infer from MMR changes (winner usually gains)
  const eastDelta = (summary.mmr?.east?.after ?? 0) - (summary.mmr?.east?.before ?? 0);
  const westDelta = (summary.mmr?.west?.after ?? 0) - (summary.mmr?.west?.before ?? 0);
  if (eastDelta !== westDelta) return eastDelta > westDelta ? 'east' : 'west';

  // Default to east if all else equals
  return 'east';
}

