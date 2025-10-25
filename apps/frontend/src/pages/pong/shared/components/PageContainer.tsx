import React from 'react';
import clsx from '../utils/clsx';

type MaxWidth = 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
type Pad = 'none' | 'sm' | 'md' | 'lg';

export type PageContainerProps<T extends React.ElementType = 'div'> = {
  as?: T;
  max?: MaxWidth;
  pad?: Pad;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const MAX_CLS: Record<MaxWidth, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

const PAD_CLS: Record<Pad, string> = {
  none: '',
  sm: 'px-4',
  md: 'px-4 sm:px-6',
  lg: 'px-4 sm:px-6 lg:px-12',
};

const PageContainer = <T extends React.ElementType = 'div'>(props: PageContainerProps<T>) => {
  const { as, max = '5xl', pad = 'lg', className, children, ...rest } = props;
  const Component = (as ?? 'div') as React.ElementType;
  const composed = clsx('mx-auto w-full', MAX_CLS[max], PAD_CLS[pad], className);
  return React.createElement(Component, { className: composed, ...rest }, children);
};

export default PageContainer;
