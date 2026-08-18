import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subdirectory of vellar-explorer, which has its own root-level
  // package-lock.json (the API service) — without this, Turbopack guesses the wrong workspace
  // root from that lockfile and warns on every dev/build.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
