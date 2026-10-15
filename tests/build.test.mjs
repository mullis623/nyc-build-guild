import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildSite, renderSite, root } from "../scripts/build.mjs";

const defaultConfig = JSON.parse(readFileSync(join(root, "guilds", "nyc.json"), "utf8"));

function invitationParams(html) {
  const attribute = html.match(/href="(mailto:[^"]+)"/)[1];
  const url = attribute.replace(/&(amp|quot|lt|gt|#39);/g, (_, entity) => ({
    amp: "&", quot: '"', lt: "<", gt: ">", "#39": "'",
  })[entity]);
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

test("NYC remains the default, with its session, notes, speakers, and assets", () => {
  const { html, assets } = renderSite(defaultConfig);
  assert.match(html, /<title>NYC Build Guild \| GitHub Copilot<\/title>/);
  assert.equal((html.match(/<article class="session-card"/g) || []).length, 1);
  assert.equal((html.match(/data-origin="guild" data-type="session"/g) || []).length, 1);
  assert.match(html, /Kenedy Thorne/);
  assert.match(html, /Al Barnes/);
  assert.match(html, /Sebastian Kowalik/);
  assert.match(html, /Shaun Mullis/);
  assert.match(html, /Sundeep Hiranandaney/);
  assert.match(html, /id="october-26-notes"/);
  assert.match(html, /GitHub Copilot Build Day: Zero to Agents/);
  assert.match(html, /Microsoft Garage/);
  assert.match(html, /\.speaker-row \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?\.speaker-row \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(html, /\{\{\w+\}\}/);
  assert.deepEqual(assets.sort(), [
    "assets/al.barnes.jpg",
    "assets/build-guild-flyer.png",
    "assets/kenedy-thorne.png",
    "assets/sebastian.kowalik.jpg",
    "assets/shaun.mullis.jpg",
    "assets/sundeep.hiranandaney.jpg",
  ]);
  const params = invitationParams(html);
  assert.equal(params.get("subject"), `Join us at ${defaultConfig.name}`);
  assert.ok(params.get("body").includes(defaultConfig.publicUrl));
  assert.ok(params.get("body").includes(defaultConfig.schedule));
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "build-guild-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "content"));
  mkdirSync(join(directory, "guilds"));
  cpSync(join(root, "site.html"), join(directory, "site.html"));
  writeFileSync(join(directory, "content", "sessions.html"), "");
  const config = {
    ...defaultConfig,
    name: 'Builders & Friends <Guild> "One"',
    description: "A different community",
    publicUrl: "https://example.org/team-guild/",
    schedule: "Friday at 10:00 UTC",
    speakers: [],
    flyer: null,
    sessionsFile: "content/sessions.html",
    notesFile: null,
  };
  return { directory, config };
}

test("another Guild replaces all NYC content without inheriting notes or assets", (t) => {
  const { directory, config } = fixture(t);
  writeFileSync(join(directory, "content", "sessions.html"),
    '<article class="session-card" data-origin="guild" data-type="workshop" data-date="2026-11-01T10:00" data-search="{{name}} workshop"><h3>{{name}} workshop</h3></article>');
  const { html, assets } = renderSite(config, directory);
  assert.match(html, /Builders &amp; Friends &lt;Guild&gt; &quot;One&quot;/);
  assert.match(html, /Friday at 10:00 UTC/);
  assert.match(html, /hero hero-text-only/);
  assert.doesNotMatch(html, /NYC Build Guild|Kenedy|Sebastian|Shaun|Sundeep|october-26|Microsoft Garage/);
  assert.doesNotMatch(html, /class="speaker-row"|class="flyer-frame"/);
  assert.deepEqual(assets, []);
  const params = invitationParams(html);
  assert.ok(params.get("body").includes(config.publicUrl));
  assert.ok(params.get("body").includes(config.schedule));
  assert.equal(params.get("subject"), `Join us at ${config.name}`);
});

test("custom speakers, flyer, notes, and linked resources are selected and escaped", (t) => {
  const { directory, config } = fixture(t);
  mkdirSync(join(directory, "assets"));
  for (const file of ["speaker.png", "flyer.png", "slides.pdf"]) {
    writeFileSync(join(directory, "assets", file), "fixture");
  }
  config.speakers = [
    { name: "Guest <One>", title: "Builder", company: "Community", image: "assets/speaker.png" },
    { name: "Octo Speaker", title: "Developer Advocate", company: "GitHub", image: "assets/speaker.png" },
  ];
  config.flyer = { image: "assets/flyer.png", alt: 'Guild "flyer"' };
  config.notesFile = "content/notes.html";
  writeFileSync(join(directory, "content", "notes.html"),
    '<section id="notes"><h3>{{name}} notes</h3><a href="assets/slides.pdf">Slides</a></section>');
  const { html, assets } = renderSite(config, directory);
  assert.match(html, /Guest &lt;One&gt;/);
  assert.match(html, /Guild &quot;flyer&quot;/);
  assert.match(html, /id="notes"/);
  assert.doesNotMatch(html, /<span class="microsoft-mark"/);
  assert.match(html, /<svg class="github-mark"[^>]+aria-hidden="true">/);
  assert.match(html, /<span class="speaker-company"><svg class="github-mark"[\s\S]*?GitHub<\/span>/);
  assert.deepEqual(assets.sort(), ["assets/flyer.png", "assets/slides.pdf", "assets/speaker.png"]);
});

test("invalid config fails explicitly before publishing output", (t) => {
  const { directory, config } = fixture(t);
  const cases = [
    [{ name: "" }, /name must/],
    [{ publicUrl: "javascript:alert(1)" }, /HTTPS/],
    [{ publicUrl: "https://user:password@example.org" }, /credentials/],
    [{ speakers: null }, /speakers must/],
    [{ sessionsFile: "content/../site.html" }, /relative path/],
    [{ sessionsFile: "content\\sessions.html" }, /relative path/],
    [{ sessionsFile: "content/missing.html" }, /does not exist/],
    [{ sessionsFile: "content/sessions.html/.." }, /relative path/],
    [{ flyer: { image: "https://example.org/flyer.png", alt: "Flyer" } }, /relative path/],
    [{ notesFile: undefined }, /notesFile must/],
  ];
  for (const [override, message] of cases) {
    assert.throws(() => renderSite({ ...config, ...override }, directory), message);
  }
  mkdirSync(join(directory, "content", "directory.html"));
  assert.throws(() => renderSite({ ...config, sessionsFile: "content/directory.html" }, directory), /must reference a file/);
  writeFileSync(join(directory, "content", "sessions.html"), "{{typo}}");
  assert.throws(() => renderSite(config, directory), /Unresolved template slot/);
});

test("build defaults to NYC and emits only index and referenced assets", (t) => {
  const { directory } = fixture(t);
  cpSync(join(root, "content"), join(directory, "content"), { recursive: true });
  cpSync(join(root, "assets"), join(directory, "assets"), { recursive: true });
  writeFileSync(join(directory, "guilds", "nyc.json"), JSON.stringify(defaultConfig));
  const output = buildSite(undefined, directory);
  assert.match(readFileSync(join(output, "index.html"), "utf8"), /NYC Build Guild/);
  assert.ok(existsSync(join(output, "assets", "build-guild-flyer.png")));
  assert.ok(!existsSync(join(output, "guilds")));
  assert.ok(!existsSync(join(output, "content")));
  assert.ok(!existsSync(join(output, "assets", "oh-build-guild-monthly-series.ics")));
  assert.throws(() => buildSite("../nyc", directory), /kebab-case/);
  assert.throws(() => buildSite("unknown", directory), /ENOENT/);
});

test("switching Guilds clears stale output and invalid builds preserve the last good site", (t) => {
  const { directory, config } = fixture(t);
  mkdirSync(join(directory, "dist", "assets"), { recursive: true });
  writeFileSync(join(directory, "dist", "assets", "old.png"), "old");
  writeFileSync(join(directory, "guilds", "test-guild.json"), JSON.stringify(config));
  const output = buildSite("test-guild", directory);
  assert.ok(!existsSync(join(output, "assets", "old.png")));
  const before = readFileSync(join(output, "index.html"), "utf8");
  writeFileSync(join(directory, "guilds", "test-guild.json"), JSON.stringify({ ...config, sessionsFile: "" }));
  assert.throws(() => buildSite("test-guild", directory), /sessionsFile must/);
  assert.equal(readFileSync(join(output, "index.html"), "utf8"), before);
});

function browser(html) {
  function element(dataset = {}) {
    return {
      dataset, value: "", hidden: false, events: {}, classes: new Set(),
      addEventListener(type, handler) { this.events[type] = handler; },
      classList: { toggle() {} },
    };
  }
  const cards = Array.from(html.matchAll(/<article class="session-card"([^>]+)>([\s\S]*?)<\/article>/g), (match) => {
    const dataset = Object.fromEntries(Array.from(match[1].matchAll(/data-(\w+)="([^"]*)"/g), (attr) => [attr[1], attr[2]]));
    return { ...element(dataset), textContent: match[2].replace(/<[^>]+>/g, "") };
  });
  const grid = {
    children: [...cards],
    querySelectorAll() { return this.children; },
    appendChild(card) { this.children = this.children.filter((item) => item !== card); this.children.push(card); },
  };
  const search = element();
  const empty = element();
  empty.classList.toggle = (name, enabled) => enabled ? empty.classes.add(name) : empty.classes.delete(name);
  const filters = ["all", "guild", "external", "deep-dive", "showcase", "workshop"].map((filter) => element({ filter }));
  const toggle = element();
  const document = {
    documentElement: { dataset: { theme: "light" } },
    querySelector(selector) { return { "#session-grid": grid, "#session-search": search, "#empty-state": empty, "#theme-toggle": toggle }[selector]; },
    querySelectorAll(selector) { return selector === ".filter" ? filters : []; },
  };
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
  runInNewContext(scripts.at(-1)[1], { document });
  return { grid, search, empty, filters, toggle, document };
}

test("session sorting, origin/type filtering, search, empty state and theme still work", () => {
  const page = browser(renderSite(defaultConfig).html);
  assert.deepEqual(page.grid.children.map((card) => card.dataset.date), ["2026-10-26T09:00:00-04:00"]);
  page.filters[1].events.click();
  assert.equal(page.grid.children.filter((card) => !card.hidden).length, 1);
  page.filters[2].events.click();
  assert.equal(page.grid.children.filter((card) => !card.hidden).length, 0);
  page.filters[5].events.click();
  assert.equal(page.grid.children.filter((card) => !card.hidden).length, 0);
  page.filters[0].events.click();
  page.search.value = "  AGENTS  ";
  page.search.events.input();
  assert.equal(page.grid.children.filter((card) => !card.hidden).length, 1);
  page.search.value = "no matching topic";
  page.search.events.input();
  assert.ok(page.empty.classes.has("show"));
  page.search.value = "";
  page.search.events.input();
  assert.equal(page.grid.children.filter((card) => !card.hidden).length, 1);
  page.toggle.events.click();
  assert.equal(page.document.documentElement.dataset.theme, "dark");
  page.toggle.events.click();
  assert.equal(page.document.documentElement.dataset.theme, "light");
});

test("empty Guilds show the empty state and search is case-insensitive for custom content", (t) => {
  const { directory, config } = fixture(t);
  const page = browser(renderSite(config, directory).html);
  assert.ok(page.empty.classes.has("show"));
  writeFileSync(join(directory, "content", "sessions.html"),
    '<article class="session-card" data-origin="guild" data-type="session" data-search="{{name}}"><h3>Welcome</h3></article>');
  const custom = browser(renderSite(config, directory).html);
  custom.search.value = "builders";
  custom.search.events.input();
  assert.equal(custom.grid.children[0].hidden, false);
});
