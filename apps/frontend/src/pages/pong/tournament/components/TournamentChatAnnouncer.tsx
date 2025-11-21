import React, { useEffect, useRef, useCallback } from 'react';
import { useChatContext } from 'apps/frontend/src/context/ChatContext';

type TournamentChatAnnouncerProps = {
  firstPlayer: string | null;
  secondPlayer: string | null;
  stage: string | null;
  participantUuids: string[];
};

const TournamentChatAnnouncer: React.FC<TournamentChatAnnouncerProps> = ({
  firstPlayer,
  secondPlayer,
  stage,
  participantUuids,
}) => {
  const { sendPayload } = useChatContext();
  const lastSigRef = useRef<string | null>(null);
  const debugLog = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (import.meta.env?.DEV) {
      console.debug(`[Tournament Announcer] ${event}`, payload ?? {});
    }
  }, []);

  useEffect(() => {
    if (!firstPlayer || !secondPlayer || !stage) return;
    if (!participantUuids || participantUuids.length === 0) return;

    const sig = `${firstPlayer}|${secondPlayer}|${stage}|${participantUuids.join(',')}`;

    // avoid sending the same announcement multiple times for the same match
    if (lastSigRef.current === sig) return;

    const sent = sendPayload({
      type: 'tournamentMsg',
      message: `Match starting: ${firstPlayer} vs ${secondPlayer} (Stage: ${stage})`,
      recipients: participantUuids,
    });
    debugLog('tournamentAnnouncement', { sig, sent });

    if (sent) {
      lastSigRef.current = sig;
    }
  }, [firstPlayer, secondPlayer, stage, participantUuids, sendPayload]);

  // headless component: nothing to render
  return null;
};

export default TournamentChatAnnouncer;
