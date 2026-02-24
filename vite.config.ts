import { defineConfig, Plugin } from 'vite';

function removeModuleType(): Plugin {
  return {
    name: 'remove-module-type',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin /g, '<script defer ');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [removeModuleType()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2017',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
