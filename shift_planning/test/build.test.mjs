import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forScriptTag, offlineComplaint, parseComplaint, assemble, OUT } from '../build.js';

test('forScriptTag keeps a bundle from closing its own tag', () => {
  assert.equal(forScriptTag('a="</script>"'), 'a="<\\/script>"');
  assert.equal(forScriptTag('nothing here'), 'nothing here');
});

test('offline guard catches every way of reaching out', () => {
  assert.equal(offlineComplaint('<script>1</script>'), null);
  assert.match(offlineComplaint('<script src="https://cdn.example/x.js"></script>'), /remote/);
  assert.match(offlineComplaint("<link href='http://x/y.css'>"), /remote/);
  assert.match(offlineComplaint('<style>@import url(x)</style>'), /@import/);
  assert.match(offlineComplaint('<script>fetch("https://x")</script>'), /fetch/);
});

test('parse guard catches a mangled script', () => {
  assert.equal(parseComplaint('<script>var a = 1;</script>'), null);
  assert.match(parseComplaint('<script>var a = ;</script>'), /does not parse/);
  assert.match(parseComplaint('<p>no script</p>'), /no inlined/);
});

test('assemble inlines css and js without String.replace surprises', () => {
  const html = assemble('<head><link rel="stylesheet" href="app.css"></head><body><script src="app.js"></script></body>',
    'body{}', 'var s = "$& $` $\' </script>";');
  assert.ok(html.includes('<style>\nbody{}\n</style>'));
  assert.ok(html.includes('var s = "$& $` $\' <\\/script>";'));
  assert.throws(() => assemble('<html></html>', '', ''), /no <script/);
});

test('the committed build passes its own guards', () => {
  assert.ok(fs.existsSync(OUT), 'run npm run build first');
  const html = fs.readFileSync(OUT, 'utf8');
  assert.equal(offlineComplaint(html), null);
  assert.equal(parseComplaint(html), null);
  assert.ok(html.includes('<title>Shift Planner</title>'));
  assert.ok(!html.includes('<link rel="stylesheet"'));
});
