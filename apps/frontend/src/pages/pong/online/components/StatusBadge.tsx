import React from 'react';
import type { Status } from '../state/types';

type StatusBadgeProps = {
  status: Status;
};

const statusToClass: Record<Status, string> = {
  connecting: 'bg-yellow-500/20 text-yellow-300',
  idle: 'bg-emerald-500/20 text-emerald-300',
  in_queue: 'bg-sky-500/20 text-sky-300',
  match_found: 'bg-indigo-500/20 text-indigo-300',
  match_accepted: 'bg-purple-500/20 text-purple-300',
  starting: 'bg-orange-500/20 text-orange-300',
  playing: 'bg-emerald-500/20 text-emerald-300',
  postmatch: 'bg-emerald-500/20 text-emerald-300',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <span className={`rounded-full px-3 py-1 text-sm capitalize ${statusToClass[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default StatusBadge;
