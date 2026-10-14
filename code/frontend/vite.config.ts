import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The site is served from the root of its own Walrus Sites subdomain, so the
// base is '/' and the portal rewrites every path to index.html through
// ws-resources.json. That is what lets the router use real URLs.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
