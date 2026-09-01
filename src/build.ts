import type { ResolvedConfig, Rolldown } from "vite";

import { createHash } from "node:crypto";
import path from "node:path";

import { compilePolyfillCss } from "./css.js";
import { runtimeScript } from "./runtime.js";

export const pluginName = "tailwind-polyfill";

interface Polyfill {
  modernFile: string;
  polyfillFile: string;
  source: string;
}

export function buildPolyfills(
  bundle: Rolldown.OutputBundle,
  config: ResolvedConfig,
  context: Rolldown.PluginContext,
): void {
  const cssAssets = Object.values(bundle).filter(
    (asset): asset is Rolldown.OutputAsset => asset.type === "asset" && asset.fileName.endsWith(".css"),
  );
  if (cssAssets.length === 0) {
    config.logger.warn(`[${pluginName}] No CSS assets were generated.`);
    return;
  }

  let result;
  try {
    result = compilePolyfillCss(
      cssAssets.map((asset) => ({ fileName: asset.fileName, source: decodeAssetSource(asset.source) })),
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`[${pluginName}] ${detail}`, { cause });
  }

  for (const warning of result.warnings) {
    const location = warning.fileName ? `${warning.fileName}: ` : "color evaluation: ";
    config.logger.warn(`[${pluginName}] ${location}${warning.message}`);
  }

  const polyfills = result.assets.map(createPolyfill);
  for (const polyfill of polyfills) {
    context.emitFile({ type: "asset", fileName: polyfill.polyfillFile, source: polyfill.source });
  }

  const htmlEntries = Object.values(bundle).filter(
    (asset): asset is Rolldown.OutputAsset => asset.type === "asset" && asset.fileName.endsWith(".html"),
  );
  for (const entry of htmlEntries) {
    entry.source = injectPolyfillMarkup(decodeAssetSource(entry.source), entry.fileName, polyfills, config.base);
  }

  if (htmlEntries.length === 0) {
    config.logger.warn(
      `[${pluginName}] No Vite HTML entry was found. Polyfill stylesheets were emitted without automatic injection.`,
    );
  }
}

function createPolyfill(asset: { modernFile: string; source: string }): Polyfill {
  const parsed = path.posix.parse(asset.modernFile);
  const hash = createHash("sha256").update(asset.source).digest("hex").slice(0, 8);
  const file = `${parsed.name}.polyfill-${hash}${parsed.ext}`;
  return { modernFile: asset.modernFile, polyfillFile: path.posix.join(parsed.dir, file), source: asset.source };
}

function injectPolyfillMarkup(html: string, htmlFile: string, polyfills: Polyfill[], base: string): string {
  const ordered = [...polyfills].sort((left, right) => {
    const leftIndex = stylesheetIndex(html, resolveAssetUrl(left.modernFile, htmlFile, base));
    const rightIndex = stylesheetIndex(html, resolveAssetUrl(right.modernFile, htmlFile, base));
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.modernFile.localeCompare(right.modernFile);
  });

  const links = ordered.map((fallback) => {
    const fallbackUrl = escapeAttribute(resolveAssetUrl(fallback.polyfillFile, htmlFile, base));
    const modernUrl = escapeAttribute(resolveAssetUrl(fallback.modernFile, htmlFile, base));
    return `<link rel="stylesheet" crossorigin href="${fallbackUrl}" media="not all" data-tailwind-polyfill data-tailwind-modern-href="${modernUrl}">`;
  });
  return injectIntoHead(html, `${links.join("")}<script data-tailwind-polyfill-runtime>${runtimeScript}</script>`);
}

function stylesheetIndex(html: string, url: string): number {
  return html.indexOf(`href="${escapeAttribute(url)}"`);
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

function decodeAssetSource(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}
