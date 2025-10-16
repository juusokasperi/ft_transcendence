import React from 'react';
import Button from '../../../../components/Button';
import type { OpponentInfo, Status } from '../state/types';

type MatchFoundPanelProps = {
  opponent: OpponentInfo;
  status: Status;
  onAccept: () => void;
  onDecline: () => void;
};

const MatchFoundPanel: React.FC<MatchFoundPanelProps> = ({
  opponent,
  status,
  onAccept,
  onDecline,
}) => {
  const accepting = status === 'match_accepted';
  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-semibold">Match Found!</p>
        <p className="text-white/70">
          Opponent: <span className="font-semibold">{opponent.username ?? 'Unknown player'}</span>{' '}
          <span className="ml-2 text-sm text-white/50">MMR: {opponent.mmr}</span>
        </p>
      </div>
      <Button
        type="button"
        variant="success"
        fullWidth
        disabled={accepting}
        onClick={onAccept}
      >
        {accepting ? 'Accepted… waiting' : 'Accept'}
      </Button>
      <Button type="button" variant="danger" fullWidth disabled={accepting} onClick={onDecline}>
        Decline
      </Button>
    </div>
  );
};

export default MatchFoundPanel;
