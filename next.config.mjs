/** @type {import('next').NextConfig} */
export default {
  // The Agent Website Studio uses server-side auth, API handlers, and dynamic routes.
  // Static export (`output: 'export'`) is incompatible with those features.
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  webpack(config) {
    config.module.rules.push({
      test: /pdf\.worker\.min\.mjs$/,
      type: 'asset/resource',
      generator: { filename: 'static/media/pdf-worker.[contenthash].js' },
    });
    return config;
  },
};
