import type { Targets } from "lightningcss";
import type { AtRule, Declaration, Node, Root } from "postcss";

import { transform } from "lightningcss";
import postcss from "postcss";

export interface ColorWarning {
  fileName?: string;
  message: string;
}

interface Mix {
  fallback: string;
  space: string;
  variable: string;
  weight: string;
}

interface Evaluation {
  color: string;
  index: number;
  mix: Mix;
}

interface Use {
  declaration: Declaration;
  mix: Mix;
  root: Root;
}

const mixPattern = /^color-mix\(in (oklab|srgb),\s*var\((--[a-zA-Z0-9_-]+)\)\s+([0-9]*\.?[0-9]+)%,\s*transparent\)$/;

// Tailwind compiles opacity-modified colors (`bg-primary/50`) as a baked concrete
// fallback plus a var-based color-mix() inside `@supports (color: color-mix(...))`.
// Legacy browsers fail that test and only render the fallback, so this module
// computes each mix into a concrete color, injects it beside every assignment
// of the source variable (preserving theme switching), and redirects to it.
export function materializeColorFallbacks(roots: Root[], targets: Targets): ColorWarning[] {
  const { mixes, uses } = collectMixes(roots);
  if (mixes.size === 0) return [];

  // Legacy browsers skip the @supports block, so its uses must redirect the sibling
  // fallback declaration instead (with @theme inline that fallback lowers to the
  // raw, opaque variable). Selectors sharing a fallback rule may need different
  // mixes; one declaration cannot hold them all, so per-selector rules are appended.
  const warnings = rewriteFallbackDeclarations(roots, uses);

  const byVariable = new Map<string, Mix[]>();
  for (const mix of mixes.values()) {
    const matches = byVariable.get(mix.variable) ?? [];
    matches.push(mix);
    byVariable.set(mix.variable, matches);
  }

  const assignments: Array<{ declaration: postcss.Declaration; evaluation: Evaluation }> = [];
  const evaluations = new Map<string, Evaluation>();

  // Legacy browsers never apply @supports blocks, so only plain assignments seed
  // evaluations; the skipped ones are wide-gamut duplicates of the same value.
  for (const root of roots) {
    root.walkDecls((declaration) => {
      if (declaration.parent?.type !== "rule" || isInsideSupports(declaration)) return;

      for (const mix of byVariable.get(declaration.prop) ?? []) {
        const key = `${declaration.value}\0${mix.space}\0${mix.variable}\0${mix.weight}`;
        let evaluation = evaluations.get(key);
        if (!evaluation) {
          evaluation = { color: declaration.value, index: evaluations.size, mix };
          evaluations.set(key, evaluation);
        }
        assignments.push({ declaration, evaluation });
      }
    });
  }

  const defined = new Set(assignments.map(({ evaluation }) => evaluation.mix.variable));
  for (const mix of mixes.values()) {
    if (!defined.has(mix.variable))
      warnings.push({ message: `No concrete declaration was found for ${mix.variable}.` });
  }

  const colors = evaluateColors([...evaluations.values()], targets, warnings);
  const unresolved = new Set<string>();
  for (const { declaration, evaluation } of assignments) {
    const color = colors.get(evaluation.index);
    if (color) declaration.cloneAfter({ prop: evaluation.mix.fallback, value: color });
    else unresolved.add(`${evaluation.mix.variable}: ${evaluation.color}`);
  }
  for (const value of unresolved) warnings.push({ message: `Could not statically evaluate ${value}.` });
  return warnings;
}

function collectMixes(roots: Root[]): { mixes: Map<string, Mix>; uses: Use[] } {
  const mixes = new Map<string, Mix>();
  const uses: Use[] = [];
  for (const root of roots) {
    root.walkDecls((declaration) => {
      const match = mixPattern.exec(declaration.value);
      if (!match) return;

      const [, space, variable, weight] = match;
      if (!space || !variable || !weight) return;

      const key = `${space}:${variable}:${weight}`;
      const mix = mixes.get(key) ?? {
        fallback: `--tw-polyfill-mix-${variable.slice(2)}-${space}-${weight.replaceAll(".", "_")}`,
        space,
        variable,
        weight,
      };
      mixes.set(key, mix);
      uses.push({ declaration, mix, root });
      declaration.value = `var(${mix.fallback},var(${variable}))`;
    });
  }
  return { mixes, uses };
}

function rewriteFallbackDeclarations(roots: Root[], uses: Use[]): ColorWarning[] {
  const warnings: ColorWarning[] = [];

  for (const root of roots) {
    const declarations = new Map<string, Declaration[]>();
    const properties = new Set<string>();
    root.walkDecls((declaration) => {
      if (declaration.parent?.type !== "rule" || isInsideSupports(declaration)) return;

      for (const selector of declaration.parent.selectors) {
        const context = ruleContext(declaration);
        const key = declarationKey(selector, declaration.prop, declaration.value, context);
        const matches = declarations.get(key) ?? [];
        matches.push(declaration);
        declarations.set(key, matches);
        properties.add(declarationKey(selector, declaration.prop, "", context));
      }
    });

    const overrides = new Map<Declaration, Map<string, Set<string>>>();
    for (const { declaration, mix, root: useRoot } of uses) {
      if (useRoot !== root || declaration.parent?.type !== "rule" || !isInsideSupports(declaration)) continue;

      for (const selector of declaration.parent.selectors) {
        const key = declarationKey(selector, declaration.prop, `var(${mix.variable})`, ruleContext(declaration));
        const matches = declarations.get(key);
        if (!matches) {
          const property = declarationKey(selector, declaration.prop, "", ruleContext(declaration));
          if (!properties.has(property))
            warnings.push({ message: `No fallback declaration was found for ${selector} using ${mix.variable}.` });
          continue;
        }

        const value = `var(${mix.fallback},var(${mix.variable}))`;
        for (const match of matches) {
          const values = overrides.get(match) ?? new Map<string, Set<string>>();
          const selectors = values.get(value) ?? new Set<string>();
          selectors.add(selector);
          values.set(value, selectors);
          overrides.set(match, values);
        }
      }
    }

    for (const [declaration, values] of overrides) {
      if (declaration.parent?.type !== "rule") continue;

      const [value] = values.keys();
      const selectors = value ? values.get(value) : undefined;
      if (value && values.size === 1 && selectors?.size === declaration.parent.selectors.length) {
        declaration.value = value;
        continue;
      }

      for (const [overrideValue, overrideSelectors] of values) {
        const rule = postcss.rule({ selector: [...overrideSelectors].join(",") });
        rule.append({ prop: declaration.prop, value: overrideValue, important: declaration.important });
        declaration.parent.after(rule);
      }
    }
  }

  return warnings;
}

function evaluateColors(evaluations: Evaluation[], targets: Targets, warnings: ColorWarning[]): Map<number, string> {
  if (evaluations.length === 0) return new Map();

  const source = evaluations
    .map(({ color, index, mix }) => `.m${index}{color:color-mix(in ${mix.space},${color} ${mix.weight}%,transparent)}`)
    .join("");
  const result = transform({
    code: new TextEncoder().encode(source),
    filename: "tailwind-compat-colors.css",
    minify: false,
    targets,
  });
  warnings.push(...result.warnings.map(({ message }) => ({ message })));

  const colors = new Map<number, string>();
  const root = postcss.parse(new TextDecoder().decode(result.code));
  root.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    const match = /^\.m(\d+)$/.exec(rule.selector);
    const color = rule.nodes.find((node) => node.type === "decl" && node.prop === "color");
    if (match?.[1] && color?.type === "decl") colors.set(Number(match[1]), color.value);
  });
  return colors;
}

function declarationKey(selector: string, prop: string, value: string, context: string): string {
  return `${context}\0${selector}\0${prop}\0${value}`;
}

function ruleContext(node: Node): string {
  const context: string[] = [];
  for (let parent = node.parent; parent && parent.type !== "root"; parent = parent.parent) {
    if (isAtRule(parent) && parent.name !== "supports") context.unshift(`@${parent.name} ${parent.params}`);
  }
  return context.join("\0");
}

function isInsideSupports(node: Node): boolean {
  for (let parent = node.parent; parent && parent.type !== "root"; parent = parent.parent) {
    if (isAtRule(parent) && parent.name === "supports") return true;
  }
  return false;
}

function isAtRule(node: Node): node is AtRule {
  return node.type === "atrule";
}
