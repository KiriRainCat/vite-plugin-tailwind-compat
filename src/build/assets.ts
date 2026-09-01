import type { Rolldown } from "vite";

import path from "node:path";

export interface CompileBundle {
  polyfillFile: string;
  modernFile: string;
  source: string;
}

export function collectCssAssets(bundle: Rolldown.OutputBundle): Rolldown.OutputAsset[] {
  return collectAssets(bundle, ".css");
}

export function collectHtmlEntries(bundle: Rolldown.OutputBundle): Rolldown.OutputAsset[] {
  return collectAssets(bundle, ".html");
}

export function createPolyfillAsset(modernFile: string, source: string): CompileBundle {
  const extension = path.posix.extname(modernFile);
  const polyfillFile = `${modernFile.slice(0, -extension.length)}.polyfill${extension}`;
  return { polyfillFile: polyfillFile, modernFile, source };
}

export function decodeAssetSource(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}

function collectAssets(bundle: Rolldown.OutputBundle, extension: string): Rolldown.OutputAsset[] {
  return Object.values(bundle).flatMap((asset) =>
    asset.type === "asset" && asset.fileName.endsWith(extension) ? [asset] : [],
  );
}
