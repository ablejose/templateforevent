/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // Bulk generation (scripts/sitegen.mjs) builds the same, already-checked
  // template hundreds of times — skip lint + type-check there for speed.
  ...(process.env.SITEGEN ? { eslint: { ignoreDuringBuilds: true }, typescript: { ignoreBuildErrors: true } } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    ],
  },
};

export default nextConfig;
