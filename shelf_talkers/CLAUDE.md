# shelf_talkers

`npm run build` → `build/shelf-talkers.html`. Edit `src/`, never `build/`.
`npm test` runs the geometry, sizing and build tests. See `README.md` for what
the tool does and how the files fit together.

esbuild is a build-time dependency only. It bundles `src/` into the output, so
the shipped file needs no network — but npm has to be present on the machine
doing the build.

`build.js` aborts if any `http(s)` `src`/`href` survives into the output, if an
`__ASSET_*` placeholder is left unreplaced, or if the inlined bundle does not
parse. Those guards are the point of the whole build: the file must work on a
shop PC with no internet, and a broken single-file build is invisible until
someone opens it.

## The split, and why

Anything answerable without a browser is kept out of the DOM code so it can be
tested: `layout.js` (pagination), the `layout()` half of each design
(fractional rects), the arithmetic half of `fit.js`, and the pure pieces of
`build.js`. Put new logic on the testable side of that line by default.

## Things that will bite you

- **Colour must be inline `<svg>`, never a CSS background.** Browsers drop CSS
  backgrounds when "Background graphics" is off in the print dialog, which is
  the default. Every coloured panel in `designs.js` is an SVG `<rect>` for
  exactly this reason.
- **`var()` does not resolve in SVG presentation attributes**, only in CSS.
  Themed colours go through inline `style`, not `fill="…"` — see `styled()` in
  `designs.js`.
- **Geometry is fractional, never in mm.** Millimetres stop at the sheet, in
  `layout.js`. Every rectangle inside a cell is a fraction of that cell, so one
  design renders correctly at 1-up or 8-up, portrait or landscape, and would
  extend to A1 without new layout work. `PAPER` in `layout.js` is where a new
  sheet size gets added.
- **Never pass the bundle to `String.replace` as the replacement string.**
  `$&`, `` $` `` and `$'` are special there, and minified output is full of
  them — it silently splices the surrounding HTML into the middle of the
  script. `build.js` uses a replacer function, then parses the inlined result
  with `vm.Script`.
- **Font filenames carry their descriptors**: `Family[.weight][.italic].woff2`.
  `build.js` parses the name to emit the matching `@font-face`. Declaring a
  700-italic file as 400-normal makes the browser synthesise a fake bold and a
  fake slant on top of a face that already has both.
- **`fit.js` owns font sizes; designs never set one.** `render()` returns
  fit-tasks. Single lines are solved exactly by one linear probe; wrapping text
  is binary-searched because line breaks move as the size changes. Sizes always
  round *down*, so a rounding error can never overflow the box.
- **Print builds into `#print-root` unscaled.** The `beforeprint` listener
  exists so Ctrl+P and File→Print work, not just the toolbar button — without it
  those paths print a blank page.
- State persists to `localStorage` under `shelf-talkers.v1`. Bump the key if the
  shape of `state` changes incompatibly.
  The wide-margin switch lives outside `state` on purpose so it is never
  saved: it should be off every time the file is opened.
