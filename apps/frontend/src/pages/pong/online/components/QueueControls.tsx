import React from 'react';
import Button from '../../../../components/Button';
import type { Status } from '../state/types';
import { formatSeconds } from '../utils/format';
import { InlineSpinner } from '@ft/spinner';

type QueueControlsProps = {
  status: Status;
  queueElapsed: number;
  onJoin: () => void;
  onLeave: () => void;
  disabled?: boolean;
};

const QueueControls: React.FC<QueueControlsProps> = ({
  status,
  queueElapsed,
  onJoin,
  onLeave,
  disabled = false,
}) => {
  if (status === 'in_queue') {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-white/70">
          <InlineSpinner
            size={16}
            color="#A855F7"
            label="Looking for an opponent"
            className="text-white/70"
            labelClassName="text-white/70"
          />
          <span className="font-mono text-sm text-white/50">({formatSeconds(queueElapsed)})</span>
        </p>
        <Button type="button" variant="secondary" fullWidth onClick={onLeave} disabled={disabled}>
          Leave Queue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="primary" fullWidth disabled={disabled} onClick={onJoin}>
        Find a Match
      </Button>
    </div>
  );
};

export default QueueControls;
