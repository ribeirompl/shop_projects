# shop_projects

A flat collection of standalone utilities for the shop. Each top-level folder is
one independent project.

Project-specific detail lives with the project: read its `README.md` for what it
does and `CLAUDE.md` for the constraints behind how it is built.

## Conventions

- **One folder per project, no shared toolchain.** Don't add a root
  `package.json`, workspace config or cross-project imports. Each project owns
  its own dependencies and build, so one can be changed without touching another.
- **Offline-first, not dependency-free.** The rule is about the *deliverable*:
  the file staff open must work on a shop PC with no internet — no CDN
  `<script src>`, no webfont fetch, no API call. Build-time dependencies are
  fine. Use a real library rather than reimplementing what it already does, and
  have the build inline it into the output.
- **Generated output lives in the project's `build/`, and is committed.**
  Keeping it in one folder makes it obvious at a glance what is source and what
  is produced. It is tracked because that single file is what staff open, and it
  must be downloadable without a toolchain — so rebuild and commit it in the
  same change as the source edit. Never hand-edit anything under `build/`.
- **Builds fail loudly.** Each `build.js` refuses to write output that reaches
  for the network or that got mangled on the way in. A broken single-file build
  is invisible until someone opens it.
- **Everything ends up on paper.** Layouts are for print, and geometry belongs in
  millimetres in one place, shared by whatever previews it and whatever renders it.
- Microsoft Publisher / Word originals are kept on disk but gitignored. They are
  historical reference, never inputs to a build.
