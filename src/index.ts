import type { Plugin, ResolvedConfig } from "vite";

import { buildPolyfills, pluginName } from "./build.js";

export default function tailwindCompat(): Plugin {
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
