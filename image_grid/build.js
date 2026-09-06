#!/usr/bin/env node
/* ==========================================================================
   build.js — bundle src/ into one standalone file.

     node build.js            →  build/image-grid.html

   What it does:
     · src/app.js             →  esbuild bundle (jsPDF + Sortable + our code),
                                 tree-shaken and minified, inlined in a <script>
     · <link rel=stylesheet>  →  <style>…</style>

   The dependencies are real npm packages, not vendored blobs, so they can be
   updated and audited normally. They only have to exist on the machine doing
   the build: the output has no <script src>, no @import and no fetch, so it
   opens on a shop PC with no network at all.
   ========================================================================== */

import fs      from 'node:fs';
import path    from 'node:path';
import vm      from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.join(ROOT, 'src');
const OUT  = path.join(ROOT, 'build', 'image-grid.html');

const read = p => fs.readFileSync(p, 'utf8');
const kb   = n => (n / 1024).toFixed(0) + ' KB';

/* A minified bundle can contain the characters "</script>" inside a string
   literal, which would close the tag early and truncate the program. */
const forScriptTag = js => js.split('</script').join('<\\/script');

async function main(){
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
    write:       false,
    metafile:    true,
    /* jsPDF reaches for these only on code paths we never call (its HTML and
       SVG renderers). Leaving them external keeps them out of the bundle
       instead of pulling in a second rendering stack. */
    external: ['canvg', 'html2canvas', 'dompurify']
  });

  const js = result.outputFiles[0].text;

  /* ---- assemble --------------------------------------------------------- */
  let html = read(path.join(SRC, 'index.html'));

  html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
    '<style>\n' + read(path.join(SRC, href)) + '\n</style>');

  /* A replacer FUNCTION, not a string: `$&`, `$'` and "$`" are special inside
     a replacement string, and a minified bundle is full of them. Passing the
     bundle as a string spliced chunks of this very page into the script. */
  const before = html;
  html = html.replace(/[ \t]*<script src="app\.js"><\/script>/,
    () => '<script>\n' + forScriptTag(js) + '\n</script>');
  if (html === before){
    console.error('build aborted — no <script src="app.js"> to replace in index.html');
    process.exit(1);
  }

  /* ---- guard: the inlined program must still parse ---------------------- */
  /* Cheap insurance against anything that mangles the script on its way into
     the page — a broken bundle is otherwise invisible until someone opens the
     file and gets a blank screen. */
  const inline = html.slice(html.indexOf('<script>') + '<script>'.length,
                            html.lastIndexOf('</script>'));
  try{
    new vm.Script(inline);
  }catch(err){
    console.error('build aborted — inlined script does not parse: ' + err.message);
    process.exit(1);
  }

  /* ---- guard: nothing may reach out to the network ---------------------- */
  const remote = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
  if (remote){
    console.error('build aborted — remote reference(s) found:\n  ' + remote.join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  /* ---- report ----------------------------------------------------------- */
  const inputs = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].inputs;
  const byPkg = {};
  for (const [file, info] of Object.entries(inputs)){
    const m = /node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/.exec(file);
    const key = m ? m[1] : 'our code';
    byPkg[key] = (byPkg[key] || 0) + info.bytesInOutput;
  }

  console.log('build/image-grid.html   ' + kb(Buffer.byteLength(html)));
  console.log('  bundle          ' + kb(Buffer.byteLength(js)) + ' minified');
  Object.entries(byPkg)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('    ' + k.padEnd(14) + kb(v)));
}

main().catch(err => { console.error(err); process.exit(1); });
