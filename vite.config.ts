import { defineConfig, Plugin } from 'vite';

// Inlines JS and CSS directly into index.html so there are no external
// files to load. The JS bundle is stored in a non-executing <script> tag
// and executed via DOM script injection — a tiny loader reads the code
// and creates a new <script> element at runtime, bypassing WebView
// restrictions on external files, large inline scripts, Blob URLs,
// and eval().
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

      // Store JS in a non-executing text/plain block, then inject it
      // as a dynamically-created <script> element. This bypasses the
      // HTML parser (which chokes on large inline scripts) while still
      // being treated as a normal inline script by the JS engine.
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
    if(s)s.textContent='Executing ('+code.length+' chars)...';
    var el=document.createElement('script');
    el.textContent=code;
    document.body.appendChild(el);
    if(s&&!window.__appStarted)s.textContent='Executed but app did not start. Length:'+code.length;
  }catch(e){
    if(s)s.textContent='Exec error: '+e.message;
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
