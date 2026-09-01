import type { CompileBundle } from "./assets.js";

import path from "node:path";

import { runtimeScript } from "../runtime.js";

export function injectPolyfillMarkup(html: string, htmlFile: string, polyfills: CompileBundle[], base: string): string {
  // Every entry receives every fallback so CSS requested by later dynamic imports is already available.
  const ordered = orderFallbacksForEntry(polyfills, html, htmlFile, base);
  const links = ordered.map((fallback) => {
    const fallbackUrl = resolveAssetUrl(fallback.polyfillFile, htmlFile, base);
    const modernUrl = resolveAssetUrl(fallback.modernFile, htmlFile, base);
    return `<link rel="stylesheet" crossorigin href="${escapeAttribute(fallbackUrl)}" media="not all" data-tailwind-polyfill data-tailwind-modern-href="${escapeAttribute(modernUrl)}">`;
  });

  const markup = `${links.join("")}<script data-tailwind-polyfill-runtime>${runtimeScript}</script>`;
  return injectIntoHead(html, markup);
}

function orderFallbacksForEntry(
  fallbacks: CompileBundle[],
  html: string,
  htmlFile: string,
  base: string,
): CompileBundle[] {
  // Preserve the modern link order because flattening cascade layers makes source order observable.
  return [...fallbacks].sort((left, right) => {
    const leftIndex = html.indexOf(resolveAssetUrl(left.modernFile, htmlFile, base));
    const rightIndex = html.indexOf(resolveAssetUrl(right.modernFile, htmlFile, base));

    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.modernFile.localeCompare(right.modernFile);
  });
}

function injectIntoHead(html: string, markup: string): string {
  const closingHead = /<\/head\s*>/i.exec(html);
  if (closingHead) return `${html.slice(0, closingHead.index)}${markup}${html.slice(closingHead.index)}`;

  const openingHead = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!openingHead) return `${markup}${html}`;

  const index = openingHead.index + openingHead[0].length;
  return `${html.slice(0, index)}${markup}${html.slice(index)}`;
}

function resolveAssetUrl(fileName: string, htmlFile: string, base: string): string {
  const encoded = fileName.split("/").map(encodeURIComponent).join("/");

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) return new URL(encoded, withTrailingSlash(base)).href;

  if (base !== "" && base !== "./") return `${withTrailingSlash(base)}${encoded}`;

  const entry = htmlFile.split(/[?#]/, 1)[0]!.replace(/^\/+/, "");
  const relative = path.posix.relative(path.posix.dirname(entry), encoded);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
