# Shelf Talkers

Lay out shelf-talker price cards and print them onto A4. Replaces the old
Microsoft Publisher templates.

## Using it

Open **`build/shelf-talkers.html`** in any browser. That is the whole program — one
file, no internet needed, works off a USB stick.

- Choose a **design**: BEST BUY, BRILLIANT BUYS or WOOL.
- Choose a **layout**: 1×3, 2×4 and so on, portrait or landscape, or type a
  custom grid. Items flow onto as many pages as needed.
- **Small print** toggles the "PRICES INCLUDE VAT / T's & C's apply" block.
  With it off, the rest of the sign grows into the space it leaves.
- Leave **Detail** empty and the price spreads into its room; leave Price
  empty too and the name takes the whole card (for a notice like
  "CLOSING DOWN SALE").
- **Wide margins** puts a 10 mm blank border round the page instead of 4 mm,
  for printers that clip the edge. It is off every time the file is opened.
- Text is sized automatically to fit its box, so long names and short names
  both look deliberate.

Entry shortcuts: **Tab** moves across, **Enter** starts a new line in any
cell (in Price each line is sized on its own, so "BOTH FOR" prints small
above a huge "R32"; in Name and Detail it picks where the text breaks),
**Ctrl+Enter** adds a row, and **⠿** drags to reorder.

In the print dialog leave **Margins: Default** and **Scale: 100%**. Your items
are saved in the browser, so closing the tab does not lose them.

## Changing it

```
src/index.html      markup + placeholders the build fills in
src/app.css         all styling, including the print rules
src/app.js          state, entry table, layout picker, preview, print
src/layout.js       sheet size and pagination
src/designs.js      the three card designs — geometry and drawing
src/fit.js          text-to-box font sizing
src/text.js         escaping and price-line splitting
assets/wool.png     WOOL logo
assets/fonts/       woff2 faces, inlined at build time
build.js            bundles and inlines all of the above into one file
test/               the pure logic, checked without a browser
build/              build output — tracked, never hand-edited
  shelf-talkers.html  the single file to hand out
```

Edit the files in `src/`, then rebuild:

```
npm install       # once
npm run build
npm test
```

esbuild is needed only on the machine doing the build; the file it produces
still opens with no internet. Never edit anything under `build/` — the next
build overwrites it. Source and rebuilt output belong in the same commit.

### How it is split

Anything with an answer that can be checked without a browser is kept out of
the DOM code, so `npm test` can cover it:

- **`layout.js`** — how many sheets, and which item lands in which cell.
- **`designs.js`** — `layout()` returns every rectangle a design uses as a
  fraction of the cell; `render()` draws it. The geometry is pure, so the
  tests can prove slots stay inside the cell and off each other.
- **`fit.js`** — the sizing arithmetic takes measurements in and returns font
  sizes; only the thin driver around it touches a real element.
- **`build.js`** — the font-descriptor parsing and the offline guards are
  exported and tested, and the suite also checks the committed
  `build/shelf-talkers.html` itself.
