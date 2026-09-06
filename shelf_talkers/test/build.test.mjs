/* The build's job is to produce one file that works on a shop PC with no
   internet. Two halves are checked here:

     · the pieces      — font descriptors and the guards, in isolation
     · the real output — build/shelf-talkers.html as committed, which is the
                         file staff actually open. If it is stale or broken,
                         nothing else in this suite would notice.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  faceDescriptors, fontFaceRule, forScriptTag,
  offlineComplaint, parseComplaint
} from '../build.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT  = path.join(ROOT, 'build', 'shelf-talkers.html');

/* ==========================================================================
   FONT DESCRIPTORS
   --------------------------------------------------------------------------
   Declaring a 700-italic file as plain 400-normal makes the browser
   synthesise a fake bold and a fake slant on top of a face that already has
   both — which looks wrong on paper and nowhere else.
   ========================================================================== */

test('a plain family name defaults to 400 normal', () => {
  assert.deepEqual(faceDescriptors('Talker-Black.woff2'),
    { family:'Talker-Black', weight:'400', style:'normal' });
});

test('a weight in the filename is carried through', () => {
  assert.deepEqual(faceDescriptors('Talker-Narrow.700.woff2'),
    { family:'Talker-Narrow', weight:'700', style:'normal' });
});

test('weight and italic together are both picked up', () => {
  assert.deepEqual(faceDescriptors('Talker-Item.700italic.woff2'),
    { family:'Talker-Item', weight:'700', style:'italic' });
});

test('italic alone keeps the default weight', () => {
  assert.deepEqual(faceDescriptors('Talker-Slab.italic.woff2'),
    { family:'Talker-Slab', weight:'400', style:'italic' });
});

test('the @font-face rule matches how the CSS asks for the face', () => {
  const css = fontFaceRule('Talker-Item.700italic.woff2', 'AAAA');
  assert.match(css, /font-family:'Talker-Item'/);
  assert.match(css, /font-weight:700/);
  assert.match(css, /font-style:italic/);
  assert.match(css, /font-display:block/);
  assert.match(css, /src:url\(data:font\/woff2;base64,AAAA\) format\('woff2'\)/);
});

test('every font actually shipped parses into a face', () => {
  const dir = path.join(ROOT, 'assets', 'fonts');
  const files = fs.readdirSync(dir).filter(f => /\.woff2$/i.test(f));

  assert.ok(files.length, 'there are fonts to embed');
  for (const f of files){
    const { family, weight, style } = faceDescriptors(f);
    assert.ok(family && !family.includes('.'), `${f}: clean family name`);
    assert.match(weight, /^\d{3}$/, `${f}: numeric weight`);
    assert.ok(style === 'italic' || style === 'normal', `${f}: real style`);
  }
});

/* ==========================================================================
   GUARDS
   ========================================================================== */

test('a page that reaches for the network is refused', () => {
  assert.match(offlineComplaint('<script src="https://cdn.example/x.js"></script>'),
    /remote reference/);
  assert.match(offlineComplaint('<link href="http://fonts.example/f.css">'),
    /remote reference/);
});

test('an unreplaced asset placeholder is refused', () => {
  assert.match(offlineComplaint('<image href="__ASSET_WOOL__">'),
    /unreplaced asset placeholder/);
});

test('a self-contained page passes the offline guard', () => {
  assert.equal(offlineComplaint('<img src="data:image/png;base64,AAA">'), null);
  // A URL inside script text is not a fetch — only src/href attributes count.
  assert.equal(offlineComplaint('<script>var docs="https://example.com"</script>'), null);
});

test('a mangled script is caught before it ships as a blank page', () => {
  assert.match(parseComplaint('<script>function (){</script>'), /does not parse/);
  assert.match(parseComplaint('<p>no script here</p>'), /no inlined <script>/);
  assert.equal(parseComplaint('<script>var a=1</script>'), null);
});

test('"</script>" inside the bundle is escaped so it cannot close the tag early', () => {
  const js = 'var s = "</script>";';
  const out = forScriptTag(js);

  assert.ok(!out.includes('</script'), 'no raw closing tag survives');
  assert.equal(parseComplaint('<script>' + out + '</script>'), null, 'and it still parses');
});

/* ==========================================================================
   THE COMMITTED OUTPUT
   --------------------------------------------------------------------------
   build/ is tracked because that file is what gets handed out. Source and
   rebuilt output belong in the same commit, so these run against whatever is
   on disk right now.
   ========================================================================== */

test('the built file exists and is not a stub', () => {
  assert.ok(fs.existsSync(OUT), 'run `npm run build`');
  assert.ok(fs.statSync(OUT).size > 100_000, 'fonts and logo are embedded');
});

test('the built file works with no internet', () => {
  const html = fs.readFileSync(OUT, 'utf8');
  assert.equal(offlineComplaint(html), null);
});

test('the built file contains a program that parses', () => {
  const html = fs.readFileSync(OUT, 'utf8');
  assert.equal(parseComplaint(html), null);
});

test('the fonts, the stylesheet and the logo all made it in', () => {
  const html = fs.readFileSync(OUT, 'utf8');

  const faces = html.match(/@font-face\{/g) || [];
  assert.equal(faces.length,
    fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).filter(f => /\.woff2$/i.test(f)).length,
    'one @font-face per shipped woff2');

  assert.match(html, /data:font\/woff2;base64,/, 'font data is inline');
  assert.match(html, /data:image\/png;base64,/, 'the logo is inline');
  assert.ok(!html.includes('<link rel="stylesheet"'), 'the stylesheet was inlined');
  assert.ok(!html.includes('<script src='), 'the script was inlined');
});

test('the built file still carries the print rules that make it usable', () => {
  const html = fs.readFileSync(OUT, 'utf8');
  assert.match(html, /@media print/, 'print stylesheet survived');
  assert.match(html, /print-root/, 'the off-screen print target is there');
});
