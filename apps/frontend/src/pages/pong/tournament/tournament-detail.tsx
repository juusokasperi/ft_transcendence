import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TournamentPage from './tournament-page';

const TournamentDetail: React.FC = () => {
  const navigate = useNavigate();
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const numericTournamentId = useMemo(() => {
    if (!tournamentId) return null;
    const parsed = Number(tournamentId);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }, [tournamentId]);

  useEffect(() => {
    if (tournamentId === undefined) return;
    if (numericTournamentId === null) {
      navigate('/ping-pong/tournaments', { replace: true });
    }
  }, [navigate, numericTournamentId, tournamentId]);

  const handleBack = () => {
    navigate('/ping-pong/tournaments');
  };

  return <TournamentPage onBack={handleBack} focusTournamentId={numericTournamentId} />;
};

export default TournamentDetail;
