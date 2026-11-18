import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable client-side router cache for dynamic pages so the home
    // dashboard always re-fetches after returning from a practice session.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
