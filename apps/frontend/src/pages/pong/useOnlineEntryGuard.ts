import { useCallback, useState } from 'react';
import type React from 'react';
import { useAppContext } from '../../context/AppContext';
import { useSnackbar } from '../../context/SnackbarContext';

type ActiveTournamentMembership = {
  tournamentId: number;
  participantId: number;
  status: string;
  name?: string | null;
};

export type OnlineEntryGuardOptions = {
  onPreload?(): void;
  onNavigateToOnline?(): void;
  onNavigateToTournament?(tournamentId: number): void;
};

export type OnlineEntryGuardResult = {
  handleOnlineClick(event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>): void;
  confirmDialogProps: {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: React.ReactNode;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    confirmDisabled?: boolean;
    onConfirm(): void;
    onCancel(): void;
  };
  isBusy: boolean;
};

const RESUME_TOURNAMENT_KEYS = ['resume_tournament', 'resume_tournament_token'];
const REDIRECT_ON_STAY_KEY = 'pong:tournament:redirectOnStay';

function clearResumeTournamentTokens() {
  for (const key of RESUME_TOURNAMENT_KEYS) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {}
    try {
      document.cookie = `${key}=; Max-Age=0; path=/`;
    } catch {}
  }
}

function persistRedirectTarget(tournamentId: number) {
  try {
    sessionStorage.setItem(
      REDIRECT_ON_STAY_KEY,
      JSON.stringify({ tournamentId, ts: Date.now() }),
    );
  } catch {}
}

/**
 * Centralizes the "Play Online" click flow when the user may be in a tournament.
 * - Checks for active tournament membership.
 * - Prompts to leave/forfeit when necessary.
 * - Clears cached resume tokens for tournament flows on exit.
 */
export function useOnlineEntryGuard(options: OnlineEntryGuardOptions = {}): OnlineEntryGuardResult {
  const { axios, navigate, user, userReady } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const [checkingTournament, setCheckingTournament] = useState(false);
  const [leavingTournament, setLeavingTournament] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<ActiveTournamentMembership | null>(null);
  const { onPreload, onNavigateToOnline, onNavigateToTournament } = options;

  const goToOnline = useCallback(() => {
    try {
      onNavigateToOnline?.() ?? navigate('/pong/online');
    } catch {}
  }, [navigate, onNavigateToOnline]);

  const handleStayInTournament = useCallback(() => {
    const tournamentId = leavePrompt?.tournamentId;
    setLeavePrompt(null);
    if (!tournamentId) return;
    persistRedirectTarget(tournamentId);
    try {
      onNavigateToTournament?.(tournamentId) ?? navigate(`/pong/tournaments/${tournamentId}`);
    } catch {}
  }, [leavePrompt?.tournamentId, navigate, onNavigateToTournament]);

  const requestLeaveTournament = useCallback(async () => {
    if (!leavePrompt) return;
    setLeavingTournament(true);
    const status = (leavePrompt.status ?? '').toLowerCase();
    try {
      if (status === 'active') {
        await axios.post(
          `/api/tournaments/${leavePrompt.tournamentId}/participants/${leavePrompt.participantId}/forfeit`,
        );
      } else {
        await axios.delete(
          `/api/tournaments/${leavePrompt.tournamentId}/participants/${leavePrompt.participantId}`,
        );
      }
      clearResumeTournamentTokens();
      setLeavePrompt(null);
      goToOnline();
    } catch (error) {
      enqueueSnackbar({
        message: 'Failed to leave your tournament. Please try again.',
        variant: 'error',
      });
    } finally {
      setLeavingTournament(false);
    }
  }, [axios, enqueueSnackbar, goToOnline, leavePrompt]);

  const handleOnlineClick = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      event.preventDefault();
      if (checkingTournament || leavingTournament) return;
      onPreload?.();

      if (!userReady || !user) {
        goToOnline();
        return;
      }

      setCheckingTournament(true);
      try {
        const { data } = await axios.get('/api/tournaments/my/active');
        const tournament = (data as any)?.tournament;
        const participant = (data as any)?.participant;
        if (tournament && participant) {
          setLeavePrompt({
            tournamentId: tournament.id,
            participantId: participant.id,
            status: tournament.status,
            name: tournament.name ?? null,
          });
          return;
        }
        goToOnline();
      } catch (error) {
        enqueueSnackbar({
          message: 'Unable to check tournament status right now. Please try again.',
          variant: 'error',
        });
      } finally {
        setCheckingTournament(false);
      }
    },
    [
      axios,
      checkingTournament,
      enqueueSnackbar,
      goToOnline,
      leavingTournament,
      onPreload,
      user,
      userReady,
    ],
  );

  const confirmDialogProps = {
    open: Boolean(leavePrompt),
    title: 'Leave your tournament?',
    description: leavePrompt
      ? `You are registered for ${
          leavePrompt.name ? `"${leavePrompt.name}"` : 'a tournament'
        }. Leaving now will ${
          (leavePrompt.status ?? '').toLowerCase() === 'active'
            ? 'forfeit any active matches.'
            : 'remove you from the lobby.'
        }`
      : undefined,
    confirmLabel:
      (leavePrompt?.status ?? '').toLowerCase() === 'active' ? 'Forfeit & leave' : 'Leave tournament',
    cancelLabel: 'Stay',
    tone: 'danger' as const,
    confirmDisabled: leavingTournament,
    onCancel: handleStayInTournament,
    onConfirm: requestLeaveTournament,
  };

  return {
    handleOnlineClick,
    confirmDialogProps,
    isBusy: checkingTournament || leavingTournament,
  };
}
