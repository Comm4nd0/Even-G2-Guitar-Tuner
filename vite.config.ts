import { defineConfig, Plugin } from 'vite';

// Inlines JS and CSS directly into index.html so there are no external
// files to load. This avoids issues with the Even app WebView failing to
// fetch separate script/style assets.
function inlineBundle(): Plugin {
  return {
    name: 'inline-bundle',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find(k => k.endsWith('.html'));
      if (!htmlKey) return;

      const htmlAsset = bundle[htmlKey];
      if (htmlAsset.type !== 'asset') return;
      let html = htmlAsset.source as string;

      // Inline all JS chunks — remove from <head> and place before </body>
      // so the DOM is available when the script runs
      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && key.endsWith('.js')) {
          const srcPattern = new RegExp(
            `<script[^>]*src=["'][^"']*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`
          );
          html = html.replace(srcPattern, '');
          html = html.replace('</body>', `<script>${chunk.code}</script>\n</body>`);
          delete bundle[key];
        }
      }

      // Inline all CSS assets
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
  plugins: [inlineBundle()],
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
