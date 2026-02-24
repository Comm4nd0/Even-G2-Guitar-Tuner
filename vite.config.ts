import { defineConfig, Plugin } from 'vite';

// Inlines JS and CSS directly into index.html so there are no external
// files to load. The JS bundle is stored in a non-executing <script> tag
// and executed via eval() — the only method that works reliably in the
// Even app WebView (external files, large inline scripts, and Blob URLs
// are all blocked).
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

      // Store JS in a non-executing text/plain block, then eval() it
      // from a tiny loader script. This avoids:
      //  - External file fetches (blocked in WebView)
      //  - Large inline <script> blocks (silently fail in WebView)
      //  - Blob URLs (blocked in WebView)
      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && key.endsWith('.js')) {
          const srcPattern = new RegExp(
            `<script[^>]*src=["'][^"']*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`
          );
          html = html.replace(srcPattern, '');

          // Escape </script in the bundle so it doesn't close the text/plain tag
          const safeCode = chunk.code.replace(/<\/script/gi, '<\\/script');

          const storage = `<script type="text/plain" id="app-bundle">${safeCode}</script>`;
          const loader = `<script>
(function(){
  var s=document.getElementById('status');
  try{
    var code=document.getElementById('app-bundle').textContent;
    if(!code){if(s)s.textContent='Error: app-bundle element empty';return;}
    if(s)s.textContent='Executing app ('+code.length+' chars)...';
    (0,eval)(code);
  }catch(e){
    if(s)s.textContent='Eval error: '+e.message;
  }
})();
</script>`;

          html = html.replace('</body>', storage + '\n' + loader + '\n</body>');
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
    target: 'es2015',
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
