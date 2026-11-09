import type { NextConfig } from "next";
import { validateDeploymentEnvironment } from "./lib/environment.mjs";

validateDeploymentEnvironment(process.env);

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
