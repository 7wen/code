// 把所有 JS（含 three.js）打包进一个 HTML：play.html，双击即可打开，不需要服务器。
// 用法：npx esbuild 可用时运行 `node build.mjs`
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = await build({
  entryPoints: [path.join(here, 'js/main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  alias: { three: path.join(here, 'lib/three.module.js') },
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(here, 'css/style.css'), 'utf8');
let html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script>/* three.js r186 (MIT) bundled */\n${js}</script>`);
fs.writeFileSync(path.join(here, 'play.html'), html);
console.log('play.html', (html.length / 1024).toFixed(0), 'KB');
