# Image Grid

Drop in a set of images, arrange them on an A4 grid, and export a print-ready
PDF. Useful for contact sheets, batches of labels, or anything you want several
copies of on one sheet.

## Using it

Open **`build/image-grid.html`** in any browser. That is the whole program — one file,
no internet needed, works off a USB stick. Images never leave the machine.

- **Click or drop** images into the drop zone. Drag a thumbnail to reorder,
  **×** removes one.
- Pick an **orientation**, a **grid** (or type a custom columns × rows), how
  images sit in their cell (**centre** or **top**), and the page **margin** in mm.
- The right-hand pane previews every page at true proportions.
- **Generate PDF** opens the finished document in a new tab, where you can print
  it or save it.

Images are fitted whole into their cell — scaled to fit, never cropped, aspect
ratio kept. Your settings are remembered; the images themselves are not, so a
reload starts with an empty sheet.

## Changing it

```
src/index.html     markup
src/app.css        styling
src/app.js         UI — images, settings, preview, PDF export
src/layout.js      page geometry in mm; the source of truth for both the
                   preview and the PDF
build.js           bundles and inlines everything into one file
test/              geometry and pagination tests
build/            build output — tracked, never hand-edited
  image-grid.html   the single file to hand out
```

```
npm install        once
npm run build      → build/image-grid.html
npm test           geometry, pagination and a real jsPDF render
```

jsPDF writes the document and Sortable handles reordering. They are ordinary npm
dependencies, so they can be updated and audited normally — `build.js` bundles
them with esbuild, tree-shakes, minifies and inlines the result. That means npm
is needed to *build*, but the file it produces has no CDN references and no
network access of any kind.

Edit the files in `src/`. Everything under `build/` is generated — the next
build overwrites it.
Source and rebuilt output belong in the same commit.
