import React from 'react';
import clsx from '../utils/clsx';

type Space = 'sm' | 'md' | 'lg';

export type PageSectionProps<T extends React.ElementType = 'section'> = {
  as?: T;
  space?: Space;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const SPACE_CLS: Record<Space, string> = {
  sm: 'py-1',
  md: 'py-2',
  lg: 'py-3',
};

const PageSection = <T extends React.ElementType = 'section'>(props: PageSectionProps<T>) => {
  const { as, space = 'lg', className, children, ...rest } = props;
  const Component = (as ?? 'section') as React.ElementType;
  const composed = clsx(SPACE_CLS[space], className);
  return React.createElement(Component, { className: composed, ...rest }, children);
};

export default PageSection;
