# @ft/spinner

Small, reusable iOS-like spinner component (React). Exposes a `Spinner` component with props:

- `size` (number) — pixels, default 40
- `color` (string) — CSS color, default iOS blue `#0A84FF`
- `className` (string) — extra classes
- `aria-label` (string) — accessibility label

Usage:

Import from the package in workspaces that support it (pnpm/yarn workspace):

```tsx
import { Spinner } from '@ft/spinner';

function MyComponent(){
  return <Spinner size={48} color="#ff3b30" />;
}
```

The component uses CSS variables for size and color so it should be easy to theme.
