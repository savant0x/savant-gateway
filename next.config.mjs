/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite is the local development engine. It must load from Node, not from a
  // Turbopack RSC bundle: its loader resolves WASM against `import.meta.url`,
  // and a bundled module URL is not a filesystem path.
  serverExternalPackages: ["better-sqlite3", "@electric-sql/pglite"],
  async headers() {
    return [
      {
        // Baseline browser hardening for every route. The proxy requests and
        // the canonical origin checks live in the route guards; these only
        // constrain how browsers treat our own responses in a hostile frame
        // or referer context.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
