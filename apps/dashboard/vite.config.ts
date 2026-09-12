import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';

const target = process.env.BRAINO_API_TARGET ?? 'http://127.0.0.1:43821';
const proxy: ProxyOptions = {
  target, changeOrigin: true,
  configure(server) {
    server.on('proxyReq', (proxyReq, req) => {
      // Keep production same-origin checks; translate only our local Vite origin.
      if (['http://127.0.0.1:5173', 'http://localhost:5173'].includes(req.headers.origin ?? '')) {
        proxyReq.setHeader('origin', new URL(target).origin);
      }
    });
  },
};

export default defineConfig({ server: { proxy: { '/api': proxy, '/auth': proxy, '/oauth': proxy } } });
