import { defineConfig, transformWithEsbuild } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ command }) => ({
  plugins: [{ name: 'app-jsx', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').includes('/app/') && id.endsWith('.js')) return transformWithEsbuild(code.replace(/^['"]use client['"];\s*/, ''), id, { loader: 'jsx', jsx: 'automatic' });
  } }, { name: 'desktop-dev-csp', apply: 'serve', transformIndexHtml(html, context) {
    const origin = new URL(context.server.resolvedUrls.local[0]);
    return html
      .replace("connect-src 'self' blob:", `connect-src 'self' blob: ws://${origin.host}`)
      .replace("img-src 'self' data: blob:", "img-src 'self' data: blob: dockit://app")
      .replace("media-src 'self' blob:", "media-src 'self' blob: dockit://app");
  } }],
  resolve: { alias: { '@': root } },
  server: { watch: { ignored: ['**/_temp/**'] } },
  define: { 'process.env.NODE_ENV': JSON.stringify(command === 'serve' ? 'development' : 'production'), 'process.env': '{}' },
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); } } },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['react-icons/ai', 'react-icons/bs', 'react-icons/cg', 'react-icons/go', 'react-icons/gr', 'react-icons/hi', 'react-icons/io5', 'react-icons/lu', 'react-icons/md', 'react-icons/pi', 'react-icons/ri', 'react-icons/rx', 'react-icons/tb', 'react-icons/vsc'],
    esbuildOptions: { loader: { '.js': 'jsx' } }
  }
}));
