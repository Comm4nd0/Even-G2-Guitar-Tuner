import { defineConfig, Plugin } from 'vite';

// Inlines JS and CSS directly into index.html. The Even app WebView
// cannot fetch external files, and its HTML parser chokes on any single
// element larger than ~10-20KB (inline scripts, text/plain blocks, etc).
// To work around this, we base64-encode the JS bundle and split it into
// many small <script> chunks (~4KB each) that progressively build a
// string variable. A final small script decodes and executes the code.
function inlineBundle(): Plugin {
  const CHUNK_SIZE = 4000;
  return {
    name: 'inline-bundle',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find(k => k.endsWith('.html'));
      if (!htmlKey) return;

      const htmlAsset = bundle[htmlKey];
      if (htmlAsset.type !== 'asset') return;
      let html = htmlAsset.source as string;

      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && key.endsWith('.js')) {
          const srcPattern = new RegExp(
            `<script[^>]*src=["'][^"']*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`
          );
          html = html.replace(srcPattern, '');

          // Base64-encode the bundle and split into small chunks.
          // Base64 is safe to split at any boundary (no escape sequences).
          const encoded = Buffer.from(chunk.code, 'utf-8').toString('base64');
          const chunks: string[] = [];
          for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
            chunks.push(encoded.slice(i, i + CHUNK_SIZE));
          }

          // Build a series of tiny <script> tags that concatenate chunks
          let injection = `<script>window.__c='';</script>\n`;
          for (const c of chunks) {
            injection += `<script>window.__c+='${c}';</script>\n`;
          }
          // Final small script: decode base64, create script element, execute
          injection += `<script>
(function(){
  var s=document.getElementById('status');
  try{
    var code=atob(window.__c);
    if(s)s.textContent='Executing ('+code.length+' chars, '+window.__c.length+' b64)...';
    var el=document.createElement('script');
    el.textContent=code;
    document.body.appendChild(el);
    if(s&&!window.__appStarted)s.textContent='Executed but app did not start';
  }catch(e){
    if(s)s.textContent='Exec error: '+e.message;
  }
})();
</script>`;

          html = html.replace('</body>', injection + '</body>');
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
