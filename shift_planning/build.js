#!/usr/bin/env node
/* ==========================================================================
   build.js — bundle src/ into one standalone file.

     npm run build            →  build/shift-planner.html

   · src/app.js             →  esbuild bundle of our modules, minified,
                               inlined in a <script>
   · <link rel=stylesheet>  →  <style>…</style>

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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.join(ROOT, 'src');
export const OUT = path.join(ROOT, 'build', 'shift-planner.html');

const read = p => fs.readFileSync(p, 'utf8');
const kb   = n => (n / 1024).toFixed(0) + ' KB';

/* ==========================================================================
   PURE PIECES — exported so they can be tested without running a build
   ========================================================================== */

/* A minified bundle can contain "</script>" inside a string literal, which
   would close the tag early and truncate the program. */
export const forScriptTag = js => js.split('</script').join('<\\/script');

/* Each guard returns a complaint, or null when clean. */
export function offlineComplaint(html){
  const remote = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
  if (remote) return 'remote reference(s) found:\n  ' + remote.join('\n  ');
  if (/@import\s/.test(html)) return '@import found in the output';
  if (/\bfetch\s*\(\s*["']https?:/.test(html)) return 'fetch() of a remote URL found in the output';
  return null;
}

export function parseComplaint(html){
  const open  = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) return 'no inlined <script> in the output';
  try {
    new vm.Script(html.slice(open + '<script>'.length, close));
    return null;
  } catch (err) {
    return 'inlined script does not parse: ' + err.message;
  }
}

/* ==========================================================================
   THE BUILD
   ========================================================================== */

const die = msg => { console.error('build aborted — ' + msg); process.exit(1); };

export async function bundle(){
  const result = await esbuild.build({
    entryPoints:   [path.join(SRC, 'app.js')],
    bundle:        true,
    minify:        true,
    treeShaking:   true,
    format:        'iife',
    platform:      'browser',
    target:        ['chrome100', 'firefox100', 'safari15', 'edge100'],
    legalComments: 'none',
    write:         false
  });
  return result.outputFiles[0].text;
}

export function assemble(indexHtml, css, js){
  let html = indexHtml.replace(/[ \t]*<link rel="stylesheet" href="app\.css">/, () => '<style>\n' + css + '\n</style>');
  /* A replacer FUNCTION, not a string: `$&`, `$'` and "$`" are special inside
     a replacement string, and a minified bundle is full of them. */
  const before = html;
  html = html.replace(/[ \t]*<script src="app\.js"><\/script>/, () => '<script>\n' + forScriptTag(js) + '\n</script>');
  if (html === before) throw new Error('no <script src="app.js"> to replace in src/index.html');
  return html;
}

async function main(){
  const js   = await bundle();
  const html = assemble(read(path.join(SRC, 'index.html')), read(path.join(SRC, 'app.css')), js);

  const complaint = parseComplaint(html) || offlineComplaint(html);
  if (complaint) die(complaint);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  console.log('build/shift-planner.html   ' + kb(Buffer.byteLength(html)));
  console.log('  bundle             ' + kb(Buffer.byteLength(js)) + ' minified');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch(err => { console.error(err); process.exit(1); });
}
