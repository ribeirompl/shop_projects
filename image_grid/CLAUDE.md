# image_grid

`npm run build` → `build/image-grid.html`. Edit `src/`, never `build/`.
`npm test` runs the geometry and pagination tests. See `README.md` for what the
tool does.

Dependencies are build-time only. esbuild bundles jsPDF and Sortable into the
output, so the shipped file needs no network — but npm does have to be present
on the machine doing the build.

## Things that will bite you

- **`layout.js` is the only place page geometry lives.** The preview positions
  divs from its rects and the PDF hands the same numbers to `jsPDF.addImage`.
  Two copies of that arithmetic drift the moment either is touched, and the
  drift only shows up on paper.
- **Never pass a bundle to `String.replace` as the replacement string.**
  `$&`, `` $` `` and `$'` are special there, and minified output is full of
  them — it silently splices the surrounding HTML into the middle of the
  script. `build.js` uses a replacer function, then parses the inlined result
  with `vm.Script` so a mangled bundle fails the build instead of shipping as a
  blank page.
- **Image format comes from the data URL** (`formatOf`). The original version of
  this tool passed `'JPEG'` for everything, which re-encoded PNGs and flattened
  their transparency.
- **jsPDF's `canvg` / `html2canvas` / `dompurify` imports are marked external**
  in the build. They belong to its HTML and SVG renderers, which this tool never
  calls; bundling them would drag in a second rendering stack.
- **Settings persist to `localStorage`, images do not.** A few photos as data
  URLs blow past the ~5 MB quota. Bump `STORE_KEY` if the shape of `settings`
  changes incompatibly.
- **Sortable owns the DOM order, the array follows.** `onEnd` reads the new
  order out of the container and re-sorts `images` to match, not the reverse.
