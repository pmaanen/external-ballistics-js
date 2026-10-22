import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// A downloaded build must also work from file://. External ES module scripts
// are blocked there, so embed the single application chunk and its stylesheet.
// Vite's inline-worker import embeds the calculation worker independently.
function portableHtml(): Plugin {
  return {
    name: 'vector-portable-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset' || typeof html.source !== 'string') {
        this.error('Portable build requires index.html.');
      }
      const chunks = Object.values(bundle).filter(file => file.type === 'chunk');
      if (chunks.length !== 1) this.error('Portable build requires a single application JavaScript chunk.');
      const text = (source: string | Uint8Array) => typeof source === 'string' ? source : new TextDecoder().decode(source);
      html.source = html.source.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (tag, url: string) => {
        const file = bundle[url.replace(/^\.\//, '')];
        if (!file || file.type !== 'chunk') this.error(`Cannot embed application script: ${url}`);
        delete bundle[file.fileName];
        return `<script type="module">${file.code.replace(/<\/script/gi, '<\\/script')}</script>`;
      }).replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, tag => {
        const url = tag.match(/\bhref="([^"]+)"/)?.[1];
        const file = url ? bundle[url.replace(/^\.\//, '')] : undefined;
        if (!file || file.type !== 'asset') this.error(`Cannot embed application stylesheet: ${url}`);
        delete bundle[file.fileName];
        return `<style>${text(file.source).replace(/<\/style/gi, '<\\/style')}</style>`;
      });
    },
  };
}

export default defineConfig({ base: './', plugins: [portableHtml()], build: { target: 'es2022' } });
