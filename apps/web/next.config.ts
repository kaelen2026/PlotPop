import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js used for type checking, so
    // the build shells out to `tsc` instead. Removing this flag makes
    // `next build` fail rather than silently skip type checking.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
