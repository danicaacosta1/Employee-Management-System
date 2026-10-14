import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  logging: {
    // Callback URLs contain one-time hashes; auth action arguments contain passwords.
    incomingRequests: { ignore: [/\/auth\/(?:confirm|error)(?:\?|$)/] },
    serverFunctions: false,
  },
  experimental: {
    agentFeedback: true,
    // The announcement bucket accepts 10MB files; allow multipart overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
