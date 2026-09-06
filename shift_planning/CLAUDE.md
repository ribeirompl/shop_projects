# shift_planning

`npm run build` → `build/shift-planner.html`. Edit `src/`, never `build/`.
`npm test` covers the notation parser, coverage and breaks, suggestions,
the week frame, weeks and availability, the print geometry and the build
guards. See `README.md` for what the tool does and how the files fit.

esbuild is a build-time dependency only. No runtime dependencies at all: the
charts are inline SVG, the print output is SVG, file autosave is the
browser's own File System Access API.

`build.js` aborts if any `http(s)` `src`/`href`, `@import` or remote `fetch`
survives into the output, or if the inlined bundle does not parse.

## The split, and why

Everything answerable without a browser is kept out of the DOM code so it can
be tested: `shifts.js` (notation), `model.js` (state, store, weeks,
availability), `coverage.js` (headcount, breaks, warnings), `suggest.js`
(ranking), `frame.js` (the generator) and `print.js` (page geometry in mm).
`weektable.js` is the one DOM component with real logic (selection, the
editor, paint mode); the views are thin.

## Things that will bite you

- **The cell text is the source of truth.** Every mode reads
  `state.cells['id|day'].t` and writes it back; the frame patterns are the
  same shape. If you add a mode, keep it that way, or two views will
  disagree about what prints.
- **`cells` is only the current week.** `gotoWeek()` parks it in
  `state.weeks[monday]` and unparks the target. Anything that needs history
  (suggestions do) walks `state.weeks` as well. Availability is keyed by
  ISO date, not week, so it survives week switches on its own.
- **The notation is deliberately am/pm-free.** "7-4" is 07:00–16:00,
  "2-8" is 14:00–20:00: a start of 1–6 is afternoon, an end that is not
  after its start rolls forward twelve hours. `formatSpan` only emits shop
  notation when it round-trips through `parseSpan`; anything else comes out
  as 24-hour ("06:00-14:00"). Do not "simplify" the format without the
  round-trip check.
- **Hours are after breaks; coverage is not.** `staffSummary().minutes` is
  paid time (`worked` is the raw figure); `dayCoverage` counts everyone on
  shift because nobody knows when the break falls. Keep that asymmetry.
- **Suggestion scores are capped on purpose.** A person's own history
  counts ten per use; the weekday and the whole roster are capped at a few
  points. Without the cap the forty OFFs in any week outrank every real
  shift. `suggest.test.mjs` pins this with the seed data.
- **Colour on the printed sheet is SVG `<rect>` fill, never CSS.** Browsers
  drop CSS backgrounds when "Background graphics" is off in the print dialog,
  which is the default. `print.js` builds whole pages as SVG in millimetres.
- **Colours live in `state.tags`, so every colour helper takes `state`.**
  `cellColor(state, cell)`, `deptOf(state, cell)`, `depts(state)`,
  `showTagMenu(state, …)`. Cells store only the tag id; renaming a colour
  renames history, deleting one (`removeTag`) strips it from every week and
  pattern. Colours are set by mouse only (chips, right-click, paint); there
  are deliberately no keyboard shortcuts for them.
- **OFF is not a tag.** A cell whose text parses as `off` is coloured
  automatically (`cellColor`). Department for coverage is `deptOf(state,
  cell)`: a tag with `dept: true`, or the tills.
- **Availability is three states, no reasons.** `unavailable()` returns
  null | 'date' | 'weekly'; `cycleUnavailable()` is the only writer.
- **The editor and selection survive rebuilds; focus is the tricky part.**
  `weektable.js` rebuilds its table on every update, then re-marks the
  selection and re-positions the popover. It only re-focuses the table when
  focus was already inside it (`focusInside`), or the page would steal focus
  from the week picker on load. Suggestion buttons use `onmousedown:
  preventDefault` so clicking one does not blur the input first.
- **Never `clear(el).append(list)`.** That is the native `append`, which
  turns an array into "[object HTMLElement],…" and `null` into the word
  "null". Use `fill(el, …children)` from `dom.js`, which goes through the
  array-aware `append`. Every view was bitten by this once.
- **`store.update(fn)` mutates in place** and snapshots the JSON before, so
  one call is one undo step. Do the whole change in one `update`; two calls
  are two undos. `{history:false}` for anything that is not roster data
  (tab, department filter, print options).
- **The file handle needs a user gesture.** After a reload the stored handle
  reports permission 'prompt'; only a click may call `requestPermission`.
  That is what the yellow banner is. With no handle at all the page opens
  with the "Where is the roster?" modal; a file the user just chose always
  wins over local storage (`loadFromFile({always:true})`). Autosave is debounced (600 ms) and
  never writes while a write is in flight. The file wins over local storage
  only when its `savedAt` is newer.
- **There is no migration, on purpose.** `migrate()` only checks a saved
  roster looks like one. While the shape is still moving, bump `STORE_KEY`
  when it changes so stale browser state is ignored, and re-create the
  roster file. `blankState()` is the base; `freshState()` is the seed week
  on top of it.
- **`seed.js` is extracted from the workbook**, not typed. If the shop's
  real roster changes, regenerate it rather than editing by hand.
