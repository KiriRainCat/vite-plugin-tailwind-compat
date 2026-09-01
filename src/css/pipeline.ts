import { transform } from "lightningcss";

import { browserTargets } from "../index.js";
import { materializeColorFallbacks } from "./colors.js";
import { preprocessCss } from "./preprocess.js";

interface CssResult {
  css: string;
  warnings: string[];
}

const emptyVarFallback = /var\((--[a-zA-Z0-9_-]+),\)/g;

export function compilePolyfillCss(source: string, filename: string): CssResult {
  const prepared = preprocessCss(source, filename);
  const transpiled = transpileCss(prepared, filename);
  const colored = materializeColorFallbacks(transpiled.css, filename);
  const finalized = fixChromiumVarFallbacks(colored);

  return { css: finalized, warnings: transpiled.warnings };
}

function transpileCss(source: string, filename: string): CssResult {
  const result = transform({
    code: new TextEncoder().encode(source),
    filename,
    minify: true,
    targets: browserTargets,
  });

  return {
    css: new TextDecoder().decode(result.code),
    warnings: result.warnings.map((warning) => warning.message),
  };
}

// Lightning CSS minifies `var(--x, )` to `var(--x,)`, which Chromium 85–91 rejects.
function fixChromiumVarFallbacks(source: string): string {
  return source.replace(emptyVarFallback, "var($1, )");
}
