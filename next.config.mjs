/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Electron production build
  output: process.env.ELECTRON_BUILD === '1' ? 'export' : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactCompiler: true,
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
