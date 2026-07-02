/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Custom server (server.ts) hosts Next internally, so Next's own
  // dev/start scripts aren't used directly — see package.json "dev"/"start".
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
