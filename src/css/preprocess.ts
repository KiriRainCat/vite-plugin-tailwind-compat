import type { Root } from "postcss";

import postcss from "postcss";

export function preprocessCss(source: string, filename: string): string {
  const root = postcss.parse(source, { from: filename });
  flattenCascadeLayers(root);
  materializePropertyDefaults(root);
  lowerTailwindSyntax(root);
  return root.toString();
}

function flattenCascadeLayers(root: Root): void {
  root.walkAtRules("layer", (rule) => {
    if (rule.nodes) rule.replaceWith(...rule.nodes);
    else rule.remove();
  });

  root.walkAtRules("import", (rule) => {
    rule.params = rule.params.replace(/\s+layer(?:\([^)]*\))?/gi, "");
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

  // Applying defaults to every element preserves the non-inheriting behavior after @property is removed.
  const defaults = postcss.rule({ selector: "*,::before,::after,::backdrop" });
  for (const [prop, value] of initialValues) defaults.append({ prop, value });
  root.append(defaults);
}

function lowerTailwindSyntax(root: Root): void {
  // Without @property typing, unit-less zero makes Tailwind's length addition invalid at computed-value time.
  root.walkDecls("--tw-ring-offset-width", (declaration) => {
    if (declaration.value === "0") declaration.value = "0px";
  });

  // Tailwind 4 uses individual transforms, which Chromium did not support before 104.
  root.walkDecls("translate", (declaration) => {
    if (declaration.value !== "var(--tw-translate-x) var(--tw-translate-y)") return;
    declaration.prop = "transform";
    declaration.value = "translate(var(--tw-translate-x),var(--tw-translate-y))";
  });
}
