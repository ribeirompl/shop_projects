#!/usr/bin/env node
/* ==========================================================================
   build.js — bundle src/ + assets/ into one standalone file.

     npm run build            →  build/shelf-talkers.html

   What it does:
     · src/app.js             →  esbuild bundle of our modules, minified,
                                 inlined in a <script>
     · <link rel=stylesheet>  →  <style>…</style>
     · <!--INLINE:FONTS-->    →  @font-face rules for every assets/fonts/*.woff2
     · __ASSET_WOOL__         →  data: URI of assets/wool.png

   esbuild only has to exist on the machine doing the build. The output has
   no <script src>, no @import and no fetch, so it opens on a shop PC with no
   network at all — and the guards below refuse to write anything that does.

   The pure pieces are exported for test/build.test.mjs; the build itself
   only runs when this file is executed directly.
   ========================================================================== */

import fs   from 'node:fs';
import path from 'node:path';
import vm   from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT   = path.dirname(fileURLToPath(import.meta.url));
const SRC    = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');
const OUT    = path.join(ROOT, 'build', 'shelf-talkers.html');

const read = p => fs.readFileSync(p, 'utf8');
const b64  = p => fs.readFileSync(p).toString('base64');
const kb   = n => (n / 1024).toFixed(0) + ' KB';

/* ==========================================================================
   PURE PIECES — exported so they can be tested without running a build
   ========================================================================== */

/* A minified bundle can contain the characters "</script>" inside a string
   literal, which would close the tag early and truncate the program. */
export const forScriptTag = js => js.split('</script').join('<\\/script');

/* Font filenames carry their descriptors: Family[.weight][.italic].woff2.
   These must match how the CSS asks for the face. Declare a 700-italic file
   as plain 400-normal and the browser will synthesise a fake bold and a fake
   slant on top of a font that already has both. */
export function faceDescriptors(filename){
  const [family, ...tags] = path.basename(filename, path.extname(filename)).split('.');
  const desc = tags.join('.');
  return {
    family,
    weight: (desc.match(/\d{3}/) || ['400'])[0],
    style:  /italic|oblique/i.test(desc) ? 'italic' : 'normal'
  };
}

export function fontFaceRule(filename, dataB64){
  const { family, weight, style } = faceDescriptors(filename);
  return `@font-face{font-family:'${family}';font-weight:${weight};` +
         `font-style:${style};font-display:block;` +
         `src:url(data:font/woff2;base64,${dataB64}) format('woff2')}`;
}

/* The guards are the point of the whole build: a file that reaches for the
   network, or that got mangled on the way in, is invisible until someone
   opens it on a shop PC. Each returns a complaint, or null when clean. */
export function offlineComplaint(html){
  const remote = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
  if (remote) return 'remote reference(s) found:\n  ' + remote.join('\n  ');
  if (html.includes('__ASSET_')) return 'unreplaced asset placeholder remains';
  return null;
}

export function parseComplaint(html){
  const open  = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) return 'no inlined <script> in the output';
  try{
    new vm.Script(html.slice(open + '<script>'.length, close));
    return null;
  }catch(err){
    return 'inlined script does not parse: ' + err.message;
  }
}

/* ==========================================================================
   THE BUILD
   ========================================================================== */

function fontFaces(){
  const dir = path.join(ASSETS, 'fonts');
  if (!fs.existsSync(dir)) return { css:'', count:0, bytes:0 };

  const files = fs.readdirSync(dir).filter(f => /\.woff2$/i.test(f));
  if (!files.length) return { css:'', count:0, bytes:0 };

  let bytes = 0;
  const rules = files.map(f => {
    const full = path.join(dir, f);
    bytes += fs.statSync(full).size;
    return fontFaceRule(f, b64(full));
  });

  return { css: '<style>\n' + rules.join('\n') + '\n</style>', count: files.length, bytes };
}

const die = msg => { console.error('build aborted — ' + msg); process.exit(1); };

async function main(){
  /* ---- assets ----------------------------------------------------------- */
  const woolPath = path.join(ASSETS, 'wool.png');
  if (!fs.existsSync(woolPath)) die('missing assets/wool.png');
  const woolURI = 'data:image/png;base64,' + b64(woolPath);

  /* ---- bundle ----------------------------------------------------------- */
  const result = await esbuild.build({
    entryPoints: [path.join(SRC, 'app.js')],
    bundle:      true,
    minify:      true,
    treeShaking: true,
    format:      'iife',
    platform:    'browser',
    target:      ['chrome100', 'firefox100', 'safari15', 'edge100'],
    legalComments: 'none',
    write:       false
  });
  const js = result.outputFiles[0].text;

  /* ---- assemble --------------------------------------------------------- */
  let html = read(path.join(SRC, 'index.html'));

  html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
    '<style>\n' + read(path.join(SRC, href)) + '\n</style>');

  /* A replacer FUNCTION, not a string: `$&`, `$'` and "$`" are special inside
     a replacement string, and a minified bundle is full of them. Passing the
     bundle as a string splices chunks of this very page into the script. */
  const before = html;
  html = html.replace(/[ \t]*<script src="app\.js"><\/script>/,
    () => '<script>\n' + forScriptTag(js) + '\n</script>');
  if (html === before) die('no <script src="app.js"> to replace in src/index.html');

  const fonts = fontFaces();
  html = html.replace('<!--INLINE:FONTS-->', () => fonts.css);
  html = html.split('__ASSET_WOOL__').join(woolURI);

  /* ---- guards ----------------------------------------------------------- */
  const complaint = parseComplaint(html) || offlineComplaint(html);
  if (complaint) die(complaint);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  /* ---- report ----------------------------------------------------------- */
  console.log('build/shelf-talkers.html   ' + kb(Buffer.byteLength(html)));
  console.log('  bundle             ' + kb(Buffer.byteLength(js)) + ' minified');
  console.log('  logo               ' + kb(fs.statSync(woolPath).size) + ' raw');
  console.log('  fonts              ' + (fonts.count
    ? fonts.count + ' embedded, ' + kb(fonts.bytes) + ' raw'
    : 'none embedded yet — using locally-installed faces'));
}

/* Only build when run as a script, so the tests can import the pieces above. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch(err => { console.error(err); process.exit(1); });
}
