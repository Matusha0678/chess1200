import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint errors in pre-existing files should not block production builds
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Disable client-side router cache for dynamic pages so the home
    // dashboard always re-fetches after returning from a practice session.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
