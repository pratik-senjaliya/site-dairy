import type { NextConfig } from 'next';

// No API address here on purpose: it is a runtime binding read per request by
// src/app/api/v1/[...path]/route.ts, so one build runs against any API.
const nextConfig: NextConfig = {};

export default nextConfig;
