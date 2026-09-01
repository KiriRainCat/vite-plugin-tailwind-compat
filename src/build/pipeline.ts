import type { CompileBundle } from "./assets.js";
import type { ResolvedConfig, Rolldown } from "vite";

import { compilePolyfillCss } from "../css/pipeline.js";
import { pluginName } from "../index.js";
import { collectCssAssets, collectHtmlEntries, createPolyfillAsset, decodeAssetSource } from "./assets.js";
import { injectPolyfillMarkup } from "./injection.js";

export function buildPolyfills(
  bundle: Rolldown.OutputBundle,
  config: ResolvedConfig,
  context: Rolldown.PluginContext,
): void {
  const cssAssets = collectCssAssets(bundle);
  if (cssAssets.length === 0) {
    config.logger.warn(`[${pluginName}] No CSS assets were generated.`);
    return;
  }

  const polyfills = cssAssets.map((asset) => compilePolyfillAsset(asset, config));
  for (const p of polyfills) context.emitFile({ type: "asset", fileName: p.polyfillFile, source: p.source });

  const htmlEntries = collectHtmlEntries(bundle);
  for (const entry of htmlEntries) {
    const html = decodeAssetSource(entry.source);
    entry.source = injectPolyfillMarkup(html, entry.fileName, polyfills, config.base);
  }

  if (htmlEntries.length === 0) {
    config.logger.warn(
      `[${pluginName}] No Vite HTML entry was found. Polyfill stylesheets were emitted without automatic injection.`,
    );
  }
}

function compilePolyfillAsset(asset: Rolldown.OutputAsset, config: ResolvedConfig): CompileBundle {
  try {
    const result = compilePolyfillCss(decodeAssetSource(asset.source), asset.fileName);
    for (const warning of result.warnings) config.logger.warn(`[${pluginName}] ${asset.fileName}: ${warning}`);
    return createPolyfillAsset(asset.fileName, result.css);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`[${pluginName}] Could not create a polyfill for ${asset.fileName}: ${detail}`, { cause });
  }
}
