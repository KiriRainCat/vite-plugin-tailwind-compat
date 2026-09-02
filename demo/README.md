# Compatibility Demo

This React 19, shadcn, and Tailwind CSS 4 app exercises the CSS forms handled by the plugin. Its Vite config imports the plugin directly from `../src/index.ts`.

## Getting Started

```bash
bun build
bun preview
```

## Checklist

Test current browsers and the documented legacy targets: Chrome/Edge 85, Firefox 80, Safari 14.1, and iOS 14.5.

- The theme button switches every card between readable light and dark colors.
- The 50% primary surface, 20% border, button variants, and input focus ring remain visible.
- The dialog opens centered with a translucent overlay and working entry/exit transforms.
- Loading the lazy panel preserves its border, background, spacing, and text color.
- In a current browser, `link[data-tailwind-compat]` elements are removed.
- In a legacy browser, compat links use `media="all"`; matching modern links use `disabled` and `media="not all"`.
- After loading the lazy panel in a legacy browser, its newly inserted modern stylesheet is also disabled.
