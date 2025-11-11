import type { FC } from 'react';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TournamentPage from './TournamentPage';

const TournamentDetail: FC = () => {
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
      navigate('/pong/tournaments', { replace: true });
    }
  }, [navigate, numericTournamentId, tournamentId]);

  return <TournamentPage focusTournamentId={numericTournamentId} />;
};

export default TournamentDetail;
