# vite-plugin-tailwind-compat

**A Vite plugin that brings Tailwind CSS 4 compatibility to older browsers.**

**Expected working targets: Chrome and Edge 85, Firefox 80, Safari 14.1, and iOS 14.5.**

## Quick Start

```bash
bun add -D vite-plugin-tailwind-compat
```

Add plugin to `vite.config.ts`

```ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tailwindCompat from "vite-plugin-tailwind-compat";

export default defineConfig({
  plugins: [tailwindcss(), tailwindCompat()],
});
```

## How It Works

During a Vite production build, the plugin:

1. Reads the final CSS output from Tailwind CSS 4.
2. Applies targeted compatibility transforms.
3. Uses Lightning CSS to lower supported syntax.
4. Emits a legacy stylesheet for each modern CSS asset.
5. Injects mutually exclusive stylesheet switching into each HTML entry.

Tailwind CSS 4 remains the only Tailwind compiler. Since the plugin operates on the final CSS, shadcn, `tw-animate-css`, themes, plugins, and custom variants work without special integration.

Legacy stylesheets are loaded eagerly when active. Modern stylesheets, including those introduced by dynamic imports, are disabled. SSR and library builds are skipped.

## Compatibility Transforms

- Flatten cascade layers
- Lower registered properties
- Precompute common variable-based opacity colors

This is targeted legacy-browser compatibility, not a complete CSS polyfill.

## Limitations

- IE11 is not supported.
- Flattening cascade layers can change style precedence.
- External `@import` rules with `layer(...)` are not lowered; Vite-resolved local imports are supported.
- Variable opacity colors are limited to `color-mix(in oklab|srgb, var(--x) n%, transparent)`.
- Legacy CSS does not preserve modern CSS code-splitting behavior.

## Compatibility Demo

The tracked React + shadcn + Tailwind CSS 4 demo covers theme tokens, variable opacity colors, focus rings, dialog transforms, and dynamically imported stylesheets.

```bash
cd ./demo
bun build
bun preview
```

See [`demo/README.md`](./demo/README.md) for the manual browser checklist.

## Development

```bash
bun fmt
bun lint
bun check
bun build
```

## License

MIT
