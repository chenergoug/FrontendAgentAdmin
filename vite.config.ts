import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react()],
    server: {
      host: env.VITE_HOST || '127.0.0.1',
      port: Number(env.VITE_PORT || 5180),
    },
    build: {
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          child: resolve(__dirname, 'child.html'),
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@ant-design/plots') || id.includes('@antv/')) return 'vendor-charts';
            if (id.includes('@ant-design/icons')) return 'vendor-icons';
            if (id.includes('/antd/') || id.includes('rc-')) return 'vendor-antd';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
  };
});
