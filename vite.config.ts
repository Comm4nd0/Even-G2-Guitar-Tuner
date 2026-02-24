import { defineConfig, Plugin } from 'vite';

// Inlines JS and CSS directly into index.html so there are no external
// files to load. The JS bundle is stored in a non-executing <script> tag
// and loaded via a small Blob URL loader to work around WebView limits
// on inline script size and inability to fetch external assets.
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

      // Inline all JS chunks — store code in a text/plain block and load
      // via Blob URL to avoid WebView inline script size limits
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
    var blob=new Blob([code],{type:'text/javascript'});
    var url=URL.createObjectURL(blob);
    var el=document.createElement('script');
    el.onerror=function(e){if(s)s.textContent='Blob load error: '+e;};
    el.onload=function(){URL.revokeObjectURL(url);};
    el.src=url;
    document.body.appendChild(el);
  }catch(e){
    if(s)s.textContent='Loader error: '+e.message;
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
