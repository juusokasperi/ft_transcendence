import React, { useState } from 'react';
import Button from '../../../../components/Button';
import type { Status } from '../state/types';
import { formatSeconds } from '../utils/format';
import { Spinner } from '@ft/spinner';

type QueueControlsProps = {
  status: Status;
  queueElapsed: number;
  onJoin: (alias?: string) => void;
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
  const [alias, setAlias] = useState('');

  if (status === 'in_queue') {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-white/70">
          <span className="inline-flex items-center gap-2">
            <Spinner size={16} color="#A855F7" aria-label="Searching for opponent" />
            <span>Looking for an opponent</span>
          </span>
          <span className="font-mono text-sm text-white/50">
            ({formatSeconds(queueElapsed)})
          </span>
        </p>
        <Button type="button" variant="secondary" fullWidth onClick={onLeave} disabled={disabled}>
          Leave Queue
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const trimmed = alias.trim();
        onJoin(trimmed || undefined);
        setAlias('');
      }}
    >
      <input
        value={alias}
        onChange={(event) => setAlias(event.target.value)}
        placeholder="Your alias (optional)"
        className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
        disabled={disabled}
      />
      <Button type="submit" variant="primary" fullWidth disabled={disabled}>
        Find a Match
      </Button>
    </form>
  );
};

export default QueueControls;
