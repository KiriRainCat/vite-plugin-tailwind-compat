import type { Plugin, ResolvedConfig } from "vite";

import { browserslistToTargets } from "lightningcss";

import { buildPolyfills } from "./build/pipeline.js";

export const pluginName = "tailwind-polyfill";
export const browserTargets = browserslistToTargets([
  "chrome 85",
  "edge 85",
  "firefox 80",
  "safari 14.1",
  "ios_saf 14.5",
]);

export default function tailwindPolyfill(): Plugin {
  let config: ResolvedConfig;

  return {
    name: pluginName,
    enforce: "post",

    // Library and SSR builds do not have an HTML document in which to install the runtime switch.
    apply(userConfig, environment) {
      return environment.command === "build" && !userConfig.build?.ssr && !userConfig.build?.lib;
    },

    configResolved(resolved) {
      config = resolved;
    },

    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        buildPolyfills(bundle, config, this);
      },
    },
  };
}
