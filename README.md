# Build Guild site template

A dependency-free static site for GitHub Copilot Build Guilds. **PennDOT is the
default**: its existing sessions, speakers, flyer, and meeting notes are retained.
All Guilds share the layout, light/dark theme, session sorting, filters, and search.

## Build and preview

Install Node.js 22 or newer. No package installation is needed.

```sh
node --test
node scripts/build.mjs
```

On Windows, `node scripts\build.mjs` is equivalent. The build writes
`dist/index.html` and only the referenced files under `dist/assets/`. Open
`dist/index.html` in a browser, or serve `dist/` with your preferred static server.
Do not serve `site.html` directly: it is the shared source template.
`dist/` is generated, ignored by Git, and replaced on every successful build.

## Add a Guild

Create `guilds/<guild-id>.json`; IDs must be lowercase kebab-case. Copy this
configuration and replace the example values (the example does not publish a site):

```json
{
  "name": "Your Build Guild",
  "description": "A community for your builders to learn, share, and ship.",
  "publicUrl": "https://YOUR-OWNER.github.io/YOUR-REPOSITORY/",
  "schedule": "Your meeting day, cadence, time, and time zone",
  "heroCopy": {
    "intro": "A community for builders to ",
    "emphasis": "learn, share, and ship",
    "outro": " using GitHub Copilot."
  },
  "speakers": [],
  "flyer": null,
  "sessionsFile": "content/your-guild-sessions.html",
  "notesFile": null
}
```

All shown fields are required. `speakers: []`, `flyer: null`, and
`notesFile: null` explicitly omit those elements; PennDOT content is never used
as a fallback. `sessionsFile` must exist but may be empty. Config errors, missing
files, and unresolved template slots fail the build rather than publishing a
partially configured site.

For each speaker, use an object with `name`, `title`, `company`, and `image`
(for example, `"image": "assets/your-guild/speaker.png"`). Only Microsoft speakers
receive the Microsoft mark. A flyer is an object with `image` and descriptive
`alt`. Put assets under `assets/`, use relative forward-slash URL paths in JSON
and HTML, and do not use absolute paths, traversal segments, or remote image URLs.
This keeps images working under GitHub Pages repository subpaths and offline.
`publicUrl` must be HTTPS and is used in the invitation email. `schedule` supplies
both the top banner and invitation; the old PennDOT invitation's conflicting
"second Tuesday" wording is replaced with its existing Thursday banner schedule.
Confirm the precise meeting time/time zone before publishing a new Guild.

Create the referenced sessions HTML fragment. This uses the existing card markup:

```html
<article class="session-card" data-origin="guild" data-type="session"
  data-date="2026-11-05T13:00:00-05:00" data-search="{{name}} welcome copilot">
  <p class="card-origin"><span class="origin-dot" aria-hidden="true"></span>{{name}} session</p>
  <div class="session-top"><div class="date-block">November 2026<b>5</b></div><span class="tag">Session</span></div>
  <div class="session-content"><h3>Welcome</h3><p>Your session description.</p></div>
  <div class="session-footer"><span>1:00 PM ET</span><a href="#welcome-notes">Read notes</a></div>
</article>
```

Use `data-origin="guild"` for Guild sessions or `"external"` for external events.
Types supported by the shared filters are `session`, `deep-dive`, `showcase`, and
`workshop`. Guild sessions lead, newest first; external events follow, oldest
first. Use ISO dates with a UTC offset for unambiguous sorting. Supply searchable
keywords in `data-search`; when absent, search uses the card's text.

If using notes, set `notesFile` to a file under `content/` containing complete
sections with IDs matching the session links, such as
`<section class="section" id="welcome-notes">...</section>`. Otherwise omit notes
links. Use `assets/...` links for downloadable resources and `https://...` for
meeting/event links. Only `{{name}}` is supported in content fragments and is
HTML-escaped by the builder. Other configured text is also escaped.
**Content fragments are trusted repository-authored HTML**, not sanitized user
input; review any HTML you copy into them.

Build your selection explicitly:

```sh
node scripts/build.mjs your-guild
```

Add your config, content, and assets to Git; do not edit generated output or
replace the PennDOT config to add a different Guild.

## Publish an individual site

Reuse this repository in the destination repository (or enable GitHub's
**Template repository** setting and use **Use this template**). In the destination:

1. Add the Guild config, content, and assets described above.
2. Set the repository Actions variable `BUILD_GUILD` to its config ID, without
   `.json`. Leaving it unset selects `penndot`.
3. Enable GitHub Pages with **GitHub Actions** as the source. Push to `main` or
   run **Deploy GitHub Pages** manually. If using another default branch, update
   the workflow's branch trigger.

The workflow runs the tests, builds the selected Guild, and uploads only `dist/`.
Each repository publishes one selected Guild, not all configs. No specific
copies have been created or deployed.

Before publishing, provide the Guild name and description, meeting cadence and
time zone, speakers/headshots, flyer (if wanted), sessions, notes/resources,
meeting links, destination GitHub owner/repository, and final public URL (including
any custom domain). Publishing also requires repository write access and permission
to enable Pages/Actions. Set `publicUrl` to that actual destination so invitations
do not send visitors back to PennDOT.