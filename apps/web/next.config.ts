import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@plotpop/ui` ships TSX source rather than a build output, so that editing a
  // component during `pnpm dev` refreshes without a rebuild step.
  transpilePackages: ["@plotpop/ui"],
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js used for type checking, so
    // the build shells out to `tsc` instead. Removing this flag makes
    // `next build` fail rather than silently skip type checking.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
