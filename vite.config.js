import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pages 项目站点位于 /仓库名/，由 GitHub Actions 自动传递，开发时仍用 /。
  base: process.env.GITHUB_PAGES_BASE || '/',
  server: { port: 5173, host: '0.0.0.0' },
  build: { target: 'es2022' },
});
