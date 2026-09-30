import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts", "editor/**/*.test.ts"],
      // The library's components import their own CSS files, which Node
      // cannot load; inlining the package runs it through Vite instead.
      server: { deps: { inline: ["@ardc-ui/react"] } },
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "./coverage",
        include: ["src/**/*.ts", "editor/**/*.ts"],
        exclude: [
          "src/**/*.test.ts",
          "editor/**/*.test.ts",
          "src/vite-env.d.ts",
        ],
      },
    },
  }),
);
