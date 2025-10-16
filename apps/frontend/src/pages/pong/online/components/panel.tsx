import React from 'react';

type PanelProps = React.PropsWithChildren<{
  className?: string;
}>;

const baseClasses =
  'rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur';

const Panel: React.FC<PanelProps> = ({ children, className }) => {
  const classes = className ? `${baseClasses} ${className}` : baseClasses;
  return <div className={classes}>{children}</div>;
};

export default Panel;
