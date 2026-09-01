import type { AtRule, Declaration, Node, Root } from "postcss";

import { transform } from "lightningcss";
import postcss from "postcss";

import { browserTargets } from "../index.js";

interface ColorMix {
  fallbackName: string;
  fallbackDeclarations: Declaration[];
  key: string;
  space: string;
  variable: string;
  weight: string;
}

interface ColorEvaluation {
  color: string;
  index: number;
  mix: ColorMix;
}

interface ColorAssignment {
  declaration: Declaration;
  evaluation: ColorEvaluation;
}

interface ColorPlan {
  assignments: ColorAssignment[];
  evaluations: ColorEvaluation[];
  mixes: ColorMix[];
}

const mixPattern = /^color-mix\(in (oklab|srgb),\s*var\((--[a-zA-Z0-9_-]+)\)\s+([0-9]*\.?[0-9]+)%,\s*transparent\)$/;

export function materializeColorFallbacks(source: string, filename: string): string {
  const root = postcss.parse(source, { from: filename });
  const plan = planColorFallbacks(root);
  if (plan.mixes.length === 0) return source;

  const colors = evaluateColorFallbacks(plan.evaluations, filename);
  applyColorFallbacks(plan, colors);
  return root.toString();
}

function planColorFallbacks(root: Root): ColorPlan {
  const mixes = collectColorMixes(root);
  const byVariable = new Map<string, ColorMix[]>();
  for (const mix of mixes) {
    const matches = byVariable.get(mix.variable) ?? [];
    matches.push(mix);
    byVariable.set(mix.variable, matches);
  }

  const assignments: ColorAssignment[] = [];
  const evaluations = new Map<string, ColorEvaluation>();
  root.walkDecls((declaration) => {
    if (declaration.parent?.type !== "rule" || isInsideSupports(declaration)) return;

    for (const mix of byVariable.get(declaration.prop) ?? []) {
      const key = `${declaration.value}\0${mix.key}`;
      let evaluation = evaluations.get(key);
      if (!evaluation) {
        evaluation = { color: declaration.value, index: evaluations.size, mix };
        evaluations.set(key, evaluation);
      }

      assignments.push({ declaration, evaluation });
    }
  });

  return { assignments, evaluations: [...evaluations.values()], mixes };
}

function collectColorMixes(root: Root): ColorMix[] {
  // Lightning CSS emits a simple fallback beside an equivalent color-mix() declaration in @supports.
  // Pairing them structurally avoids making assumptions about Tailwind class names.
  const fallbackDeclarations = new Map<string, Declaration[]>();
  root.walkDecls((declaration) => {
    if (declaration.parent?.type !== "rule" || isInsideSupports(declaration)) return;

    const key = declarationKey(
      declaration.parent.selector,
      declaration.prop,
      declaration.value,
      ruleContext(declaration),
    );
    const matches = fallbackDeclarations.get(key) ?? [];
    matches.push(declaration);
    fallbackDeclarations.set(key, matches);
  });

  const mixes = new Map<string, ColorMix>();
  root.walkDecls((declaration) => {
    if (declaration.parent?.type !== "rule") return;

    const match = declaration.value.match(mixPattern);
    if (!match) return;

    const [, space, variable, weight] = match;
    if (!space || !variable || !weight) return;

    const declarationMatch = declarationKey(
      declaration.parent.selector,
      declaration.prop,
      `var(${variable})`,
      ruleContext(declaration),
    );
    const matchedFallbacks = fallbackDeclarations.get(declarationMatch);
    if (!matchedFallbacks) return;

    const key = `${space}:${variable}:${weight}`;
    const mix: ColorMix = mixes.get(key) ?? {
      fallbackName: `--tw-polyfill-mix-${variable.slice(2)}-${space}-${weight.replace(".", "_")}`,
      fallbackDeclarations: [],
      key,
      space,
      variable,
      weight,
    };

    mix.fallbackDeclarations.push(...matchedFallbacks);
    mixes.set(key, mix);
  });
  return [...mixes.values()];
}

function evaluateColorFallbacks(evaluations: ColorEvaluation[], filename: string): Map<number, string> {
  if (evaluations.length === 0) return new Map();

  // One synthetic stylesheet lets Lightning CSS evaluate every concrete mix in a single native call.
  const source = evaluations
    .map(({ color, index, mix }) => `.m${index}{color:color-mix(in ${mix.space},${color} ${mix.weight}%,transparent)}`)
    .join("");

  const result = transform({
    code: new TextEncoder().encode(source),
    filename,
    minify: false,
    targets: browserTargets,
  });

  const colors = new Map<number, string>();
  const root = postcss.parse(new TextDecoder().decode(result.code));

  root.walkRules((rule) => {
    if (isInsideSupports(rule)) return;

    for (const selector of rule.selectors) {
      const match = /^\.m(\d+)$/.exec(selector);
      if (!match) continue;

      const declaration = rule.nodes.find((node) => node.type === "decl" && node.prop === "color");
      if (declaration?.type === "decl") colors.set(Number(match[1]), declaration.value);
    }
  });

  return colors;
}

function applyColorFallbacks(plan: ColorPlan, colors: Map<number, string>): void {
  for (const mix of plan.mixes) {
    for (const declaration of mix.fallbackDeclarations) {
      declaration.value = `var(${mix.fallbackName},var(${mix.variable}))`;
    }
  }

  for (const { declaration, evaluation } of plan.assignments) {
    const color = colors.get(evaluation.index);
    if (color) declaration.cloneAfter({ prop: evaluation.mix.fallbackName, value: color });
  }
}

function declarationKey(selector: string, prop: string, value: string, context: string): string {
  return `${context}\0${selector}\0${prop}\0${value}`;
}

function ruleContext(node: Node): string {
  const context: string[] = [];
  for (let parent: Node | undefined = node.parent; parent && parent.type !== "root"; parent = parent.parent) {
    // @supports wraps the modern half of a fallback/modern declaration pair, so it is omitted intentionally.
    if (isAtRule(parent) && parent.name !== "supports") context.unshift(`@${parent.name} ${parent.params}`);
  }

  return context.join("\0");
}

function isInsideSupports(node: Node): boolean {
  for (let parent: Node | undefined = node.parent; parent && parent.type !== "root"; parent = parent.parent) {
    if (isAtRule(parent) && parent.name === "supports") return true;
  }

  return false;
}

function isAtRule(node: Node): node is AtRule {
  // cspell: disable-next-line
  return node.type === "atrule";
}
