import { defineConfig, Plugin } from 'vite';

/**
 * Inlines all JS and CSS directly into index.html so the .ehpk WebView
 * doesn't need to fetch external files.
 */
function inlineAll(): Plugin {
  return {
    name: 'inline-all',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find(k => k.endsWith('.html'));
      if (!htmlKey) return;

      const htmlAsset = bundle[htmlKey];
      if (htmlAsset.type !== 'asset') return;
      let html = htmlAsset.source as string;

      // Inline JS chunks
      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && key.endsWith('.js')) {
          const srcPattern = new RegExp(
            `<script[^>]*src=["'][^"']*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`
          );
          html = html.replace(srcPattern, `<script>${chunk.code}</script>`);
          delete bundle[key];
        }
      }

      // Inline CSS assets
      for (const [key, asset] of Object.entries(bundle)) {
        if (asset.type === 'asset' && key.endsWith('.css')) {
          const hrefPattern = new RegExp(
            `<link[^>]*href=["'][^"']*${asset.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`
          );
          html = html.replace(hrefPattern, `<style>${asset.source}</style>`);
          delete bundle[key];
        }
      }

      htmlAsset.source = html;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [inlineAll()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
});
