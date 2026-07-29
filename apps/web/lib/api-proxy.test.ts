import { describe, expect, it } from "vitest";
import { apiProxyRewrites } from "./api-proxy";

/**
 * ADR-007's same-origin proxy is one line of configuration whose absence is
 * invisible in development — where web and api share `localhost` and cookies work
 * either way — and shows up in production as logins that expire at random.
 */
describe("api proxy", () => {
  it("forwards every /api path to the api origin", () => {
    expect(apiProxyRewrites("https://api.plotpop.com")).toEqual([
      { source: "/api/:path*", destination: "https://api.plotpop.com/api/:path*" },
    ]);
  });

  it("covers the auth routes as well as the versioned ones", () => {
    const [rewrite] = apiProxyRewrites("http://localhost:3001");

    expect(rewrite?.source).toBe("/api/:path*");
    expect(rewrite?.destination).toBe("http://localhost:3001/api/:path*");
  });

  it("does not double the slash when the configured origin ends in one", () => {
    expect(apiProxyRewrites("https://api.plotpop.com/")[0]?.destination).toBe(
      "https://api.plotpop.com/api/:path*",
    );
  });
});
