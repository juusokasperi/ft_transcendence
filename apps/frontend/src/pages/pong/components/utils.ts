import type { TournamentMatchState } from '@pong/shared/protocol/net';
import type { ReadyMatch } from './types';

const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Checked in',
  active: 'Active',
  champion: 'Champion',
  silver: 'Silver',
  third_place: 'Third place',
  eliminated: 'Eliminated',
  forfeited: 'Forfeited',
};

export function participantStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  const normalized = status.toLowerCase();
  if (normalized in PARTICIPANT_STATUS_LABELS) {
    return PARTICIPANT_STATUS_LABELS[normalized]!;
  }
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function stageLabel(match: TournamentMatchState): string {
  if (match.roundNumber === 1) return `Semifinal ${match.roundPosition}`;
  return match.roundPosition === 1 ? 'Final' : 'Bronze Match';
}

export function readyStageLabel(match: ReadyMatch): string {
  switch (match.stage) {
    case 'semifinal':
      return 'Semifinal';
    case 'final':
      return 'Final';
    case 'bronze':
    default:
      return 'Bronze Match';
  }
}
