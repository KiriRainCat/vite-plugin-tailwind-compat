import type { Root } from "postcss";

import { browserslistToTargets, transform } from "lightningcss";
import postcss from "postcss";

import { materializeColorFallbacks } from "./colors.js";

export interface CssAsset {
  fileName: string;
  source: string;
}

export interface CompileResult {
  assets: Array<{ modernFile: string; source: string }>;
  warnings: Array<{ fileName?: string; message: string }>;
}

const targets = browserslistToTargets(["chrome 85", "edge 85", "firefox 80", "safari 14.1", "ios_saf 14.5"]);
const emptyVarFallback = /var\((--[a-zA-Z0-9_-]+),\)/g;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function compilePolyfillCss(assets: CssAsset[]): CompileResult {
  const warnings: CompileResult["warnings"] = [];
  const roots = assets.map(({ fileName, source }) => {
    try {
      const prepared = preprocessCss(source, fileName);
      const result = transform({
        code: encoder.encode(prepared.toString()),
        filename: fileName,
        minify: true,
        targets,
      });
      warnings.push(...result.warnings.map(({ message }) => ({ fileName, message })));
      return postcss.parse(decoder.decode(result.code), { from: fileName });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Could not compile ${fileName}: ${detail}`, { cause });
    }
  });

  warnings.push(...materializeColorFallbacks(roots, targets));
  return {
    assets: roots.map((root, index) => ({
      modernFile: assets[index]!.fileName,
      source: fixChromiumVarFallbacks(root.toString()),
    })),
    warnings,
  };
}

function preprocessCss(source: string, filename: string): Root {
  const root = postcss.parse(source, { from: filename });
  flattenCascadeLayers(root);
  materializePropertyDefaults(root);
  lowerTailwindSyntax(root);
  return root;
}

function flattenCascadeLayers(root: Root): void {
  root.walkAtRules("layer", (rule) => {
    if (rule.nodes) rule.replaceWith(...rule.nodes);
    else rule.remove();
  });
}

function materializePropertyDefaults(root: Root): void {
  const initialValues = new Map<string, string>();
  root.walkAtRules("property", (rule) => {
    const inherits = rule.nodes?.find((node) => node.type === "decl" && node.prop === "inherits");
    const value = rule.nodes?.find((node) => node.type === "decl" && node.prop === "initial-value");
    if (inherits?.type === "decl" && inherits.value === "false" && value?.type === "decl")
      initialValues.set(rule.params, value.value);
    rule.remove();
  });
  if (initialValues.size === 0) return;

  const defaults = postcss.rule({ selector: "*,::before,::after,::backdrop" });
  for (const [prop, value] of initialValues) defaults.append({ prop, value });

  const imports = root.nodes.filter(
    (node) => node.type === "atrule" && (node.name === "charset" || node.name === "import"),
  );
  const boundary = imports.at(-1);
  if (boundary) root.insertAfter(boundary, defaults);
  else root.prepend(defaults);
}

function lowerTailwindSyntax(root: Root): void {
  root.walkDecls("--tw-ring-offset-width", (declaration) => {
    if (declaration.value === "0") declaration.value = "0px";
  });

  root.walkDecls("translate", (declaration) => {
    if (declaration.value !== "var(--tw-translate-x) var(--tw-translate-y)") return;

    const translation = "translate(var(--tw-translate-x),var(--tw-translate-y))";
    const parent = declaration.parent;
    const existing =
      parent?.type === "rule"
        ? parent.nodes.findLast((node) => node.type === "decl" && node.prop === "transform")
        : undefined;
    if (existing?.type === "decl") {
      existing.value = `${translation} ${existing.value}`;
      declaration.remove();
    } else {
      declaration.prop = "transform";
      declaration.value = translation;
    }
  });
}

// Lightning CSS minifies `var(--x, )` to `var(--x,)`, which Chromium 85–91 rejects.
function fixChromiumVarFallbacks(source: string): string {
  return source.replace(emptyVarFallback, "var($1, )");
}
