import React from 'react';
import SurfaceCard from '../../shared/components/SurfaceCard';
import AliasInput from './AliasInput';

type AliasCardProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Lightweight card to set a preferred alias used when creating or joining tournaments.
 * Keeps validation consistent by delegating to AliasInput.
 */
const AliasCard: React.FC<AliasCardProps> = ({ value, onChange }) => {
  return (
    <SurfaceCard className="p-4 shadow-2xl">
      <h2 className="mb-2 text-base font-semibold">Choose an alias</h2>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <AliasInput
          value={value}
          onChange={onChange}
          inputClassName="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none md:max-w-sm"
          placeholder="Your alias (optional)"
        />
      </div>
      <p className="mt-1 text-xs text-white/60">
        This pseudo will be used for all tournaments until you change it.
      </p>
    </SurfaceCard>
  );
};

export default AliasCard;
