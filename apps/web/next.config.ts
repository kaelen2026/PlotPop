import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { parseWebEnv } from "@plotpop/config";
import type { NextConfig } from "next";
import { apiProxyRewrites } from "./lib/api-proxy";

/*
 * `next dev` only reads `.env*` from `apps/web`, while the api and worker read the
 * repository root file. Pointing `loadEnvConfig` at the root keeps one file
 * describing a local environment instead of two that drift.
 *
 * The directory comes from the working directory rather than this module: Next.js
 * compiles this file elsewhere before running it, so its own location is not the
 * app's. The reload flag is required — Next.js has already loaded `apps/web` by the
 * time the config runs, and the loader caches its first answer.
 */
loadEnvConfig(
  resolve(process.cwd(), "../.."),
  process.env.NODE_ENV !== "production",
  console,
  true,
);

// Parsed here so a missing api origin fails the build rather than producing a
// deployment whose sign-in silently 404s. The web schema carries no database,
// queue or storage credentials at all (ADR-001).
const env = parseWebEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@plotpop/ui` ships TSX source rather than a build output, so that editing a
  // component during `pnpm dev` refreshes without a rebuild step.
  transpilePackages: ["@plotpop/ui"],
  rewrites: () => Promise.resolve(apiProxyRewrites(env.apiBaseUrl)),
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js used for type checking, so
    // the build shells out to `tsc` instead. Removing this flag makes
    // `next build` fail rather than silently skip type checking.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
