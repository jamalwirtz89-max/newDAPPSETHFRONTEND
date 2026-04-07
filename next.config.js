const nextConfig = {
  basePath: '/472026',
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs    : false,
        net   : false,
        tls   : false,
        crypto: false,
      };
    }
    return config;
  },

  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
    ];
  },
};

module.exports = nextConfig;