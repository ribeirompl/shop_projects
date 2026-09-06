# Shift Planner

Plan the week's cashier shifts, see where the floor is thin while you do it,
and print the roster. Replaces `ShiftHoursEntry.xlsm`.

## Using it

Open **`build/shift-planner.html`** in Chrome or Edge. That is the whole
program — one file, no internet needed, works off a USB stick.

The first time, it asks where the roster is: **open the saved roster file**
(the normal case — the file the shop already uses, ideally in a folder that
Google Drive or OneDrive backs up) or **save this roster to a new file**,
which writes what is on screen wherever you choose. From then on every
change is written to that file. On later visits the browser wants one click
before it may touch the file again; that is the yellow bar.

**Save this roster to a new file…** is in the ⋯ menu too: it is how a
roster kept in the browser only gets onto disk, and how you take a copy
somewhere else and carry on in it. It never empties anything — to start
from nothing, clear the weeks and edit the staff list in Setup.

Shifts are written the way the old sheet wrote them: `7-4` is 07:00–16:00,
`12-8` is 12:00–20:00, `2-8` is 14:00–20:00, `8-12, 5-8` is a split shift,
`OFF` is a day off. Anything else (`**`, `exam`) is printed as typed and
flagged.

### The grid

People down, days across. Click a cell, or move to it with the arrow keys
and just start typing, and a small editor opens under it:

- The list is the shifts most likely for **this person** on **this day** —
  their own usual shifts first, then what others do on that weekday, then
  everything else. Typing narrows it: `7` keeps the sevens, `12` keeps
  12-8, `o` keeps OFF. Anything you type that reads as a shift is offered
  first, so a one-off `7-3` is never blocked.
- `Enter` accepts and moves down, `Tab` moves right, `Esc` closes.
  Colours are the chips under the list, or right-click a cell.
- **Paint** (the chips above the table) is for the mouse: click a shift or
  a colour, then click cells to stamp it. `Esc` stops.
- A red corner on a cell means the person said they cannot work that day
  (see Availability); OFF sits at the top of that cell's suggestions.

Each day's header carries a small bar chart of how many people are on
through the day. Row ends show hours after breaks and days worked.

### Rotation

The permanents repeat a fixed set of weekly patterns — Week 1, Week 2,
Week 3, then Week 1 again — anchored on a Monday. The tool works out which
pattern the chosen week is and one button applies it; the casuals are then
done by hand in the Grid. Patterns are edited in the same grid-and-editor. Week 1 starts on the
anchor Monday set on the Setup page (1 Jan 2024 unless changed).

Setting the patterns up the first time is easier the other way round: type
a week into the Grid, then **⋯ → Fill Week N from the week of …** on that
pattern. It takes the whole week for everyone in the frame exactly as it
stands, blank days included — so someone with nothing that week gets an
empty pattern, and applying it later clears their week. Use the ◀ ▶ arrows
to land on the week you want to copy first; the same ⋯ clears a pattern,
and undo covers both.

### Availability

Click a day to cycle it: available → unavailable → every Tuesday (or
whichever weekday) → available. The Grid shows the mark as a red corner
and flags any shift typed into it anyway.

### Setup

Names, permanent or casual, the order they print in; the **colours**
(rename, recolour, add, remove — a colour that "counts as a department" is
where the person works that day and gets its own coverage heatmap); shop
opening hours; break rules ("over 5 hours: 60 minutes unpaid" — hours
everywhere are after breaks); what gets flagged; the rotation anchor; and
the printed notice line.

### The side panel

Always visible: heatmaps of how many people are on the floor per hour per
day — everyone first, then the tills, then each department colour — and a
list of anything flagged.

### Weeks and printing

- ◀ ▶ move a week at a time; the week name jumps back to this week;
  **Next week** jumps to the week usually being planned. **⋯ → Copy the
  previous week** starts a week from the last one.
- **Print by day** is for management: name and hours down each day's
  column in start-time order. **Print by staff** is for the staff room: one
  row per person, alphabetical, no totals. Both are A4 landscape. `Ctrl`+`P`
  prints by day. Leave **Margins: None** or **Default** and **Scale: 100%**.
  `Ctrl`+`Z` undoes.
- Export/Import (⋯ menu) make and read a plain copy of the roster for
  browsers that cannot autosave to a file.

## Changing it

```
src/index.html      markup
src/app.css         shell styling and the print rules
src/app.js          shell: weeks, tabs, undo, the roster file, the two print buttons
src/dom.js          h() element builder
src/menu.js         the popup menu and the colour picker
src/shifts.js       the notation: text ↔ minutes
src/model.js        state shape, store (undo, persistence), weeks, colours, availability
src/seed.js         the August 2026 roster from the workbook
src/coverage.js     headcount per instant and department, breaks, warnings
src/suggest.js      ranking and filtering of shift suggestions
src/frame.js        the week-frame generator
src/weektable.js    the shared table, selection and cell editor
src/filesync.js     autosave to a file on disk (File System Access API)
src/print.js        the printed pages as SVG in millimetres
src/side.js         the always-on panel: heatmap, hours, flags
src/views/          grid, rotation, availability, setup
build.js            bundles and inlines everything into one file
test/               the pure logic, checked without a browser
build/              build output — tracked, never hand-edited
  shift-planner.html  the single file to hand out
```

```
npm install       # once
npm run build     # → build/shift-planner.html
npm test
```

esbuild is needed only on the machine doing the build; the file it produces
opens with no internet. Never edit anything under `build/` — the next build
overwrites it. Source and rebuilt output belong in the same commit.

`ShiftHoursEntry.xlsm` is the workbook this replaces, kept for reference and
gitignored like the other Office originals.
