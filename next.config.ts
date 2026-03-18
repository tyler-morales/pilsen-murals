import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kybuqyudjhpkpilapkkb.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack: (config) => {
    // Suppress PackFileCacheStrategy "Serializing big strings" warning (webpack cache, not app code)
    config.infrastructureLogging = { level: "error" };
    return config;
  },
};

export default nextConfig;
