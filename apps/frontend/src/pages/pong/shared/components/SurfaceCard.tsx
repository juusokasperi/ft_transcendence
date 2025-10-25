import React from 'react';

type SurfaceCardProps<T extends React.ElementType = 'div'> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const baseClasses = 'rounded-2xl border border-white/10 bg-white/5 backdrop-blur';

const SurfaceCard = <T extends React.ElementType = 'div'>(props: SurfaceCardProps<T>) => {
  const { as, className, children, ...rest } = props;
  const Component = (as ?? 'div') as React.ElementType;
  const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;
  return React.createElement(Component, { className: composedClassName, ...rest }, children);
};

export default SurfaceCard;
