# @ft/spinner

Small, reusable spinner component (React). Exposes a `Spinner` with props:

- `size` (number) — pixels, default 40
- `color` (string) — CSS color, default violet `#A855F7`
- `className` (string) — extra classes
- `aria-label` (string) — accessibility label

Usage:

Import from the package in workspaces that support it (pnpm/yarn workspace):

```tsx
import { Spinner } from '@ft/spinner';

function MyComponent() {
  return <Spinner size={48} color="#ff3b30" />;
}
```

Implementation details:

- Twelve-dot indicator laid out with Tailwind utilities—no stylesheet import needed.
- Keyframes for the fade/scale effect are injected once at runtime, keeping the package self-contained.
- Size and color are driven via inline styles, so the spinner adapts to dynamic values or CSS variables.
