import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function localFile(value, directory, field, sourceRoot) {
  text(value, field);
  if (!value.startsWith(`${directory}/`) || /[\\?#:%]/.test(value) ||
      value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${field} must be a relative path inside ${directory}/`);
  }
  const path = join(sourceRoot, value);
  if (!existsSync(path)) throw new Error(`${field} file does not exist: ${value}`);
  if (!statSync(path).isFile()) throw new Error(`${field} must reference a file: ${value}`);
  return path;
}

export function renderSite(config, sourceRoot = root) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Guild configuration must be an object");
  }
  const name = text(config.name, "name");
  const description = text(config.description, "description");
  const schedule = text(config.schedule, "schedule");
  const publicUrl = new URL(text(config.publicUrl, "publicUrl"));
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password) {
    throw new Error("publicUrl must be an HTTPS URL without credentials");
  }
  const copy = config.heroCopy;
  if (!copy || typeof copy !== "object") throw new Error("heroCopy must contain intro, emphasis, and outro");
  const heroCopy = `${escapeHtml(text(copy.intro, "heroCopy.intro"))}<strong>${escapeHtml(text(copy.emphasis, "heroCopy.emphasis"))}</strong>${escapeHtml(text(copy.outro, "heroCopy.outro"))}`;
  if (!Array.isArray(config.speakers)) throw new Error("speakers must be an array (use [] for none)");
  const speakers = config.speakers.map((speaker, index) => {
    if (!speaker || typeof speaker !== "object") throw new Error(`speakers[${index}] must be an object`);
    const speakerName = escapeHtml(text(speaker.name, `speakers[${index}].name`));
    const title = escapeHtml(text(speaker.title, `speakers[${index}].title`));
    const company = escapeHtml(text(speaker.company, `speakers[${index}].company`));
    localFile(speaker.image, "assets", `speakers[${index}].image`, sourceRoot);
    const mark = speaker.company === "Microsoft"
      ? '<span class="microsoft-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
      : speaker.company === "GitHub"
        ? '<svg class="github-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.71.4.08.55-.17.55-.39 0-.19-.01-.83-.01-1.51-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.83.72 1.22 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.2-3.64-.9-3.64-4.01 0-.88.31-1.61.82-2.18-.08-.2-.36-1.03.08-2.15 0 0 .67-.22 2.2.83A7.4 7.4 0 0 1 8 3.93c.68 0 1.36.09 2 .27 1.53-1.05 2.2-.83 2.2-.83.44 1.12.16 1.95.08 2.15.51.57.82 1.3.82 2.18 0 3.12-1.87 3.81-3.65 4.01.29.25.54.74.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.47.55.39A8.15 8.15 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z"/></svg>'
        : "";
    return `<div class="speaker"><span class="speaker-avatar"><img src="${escapeHtml(speaker.image)}" alt="" /></span><span><span class="speaker-name">${speakerName}</span><span class="speaker-title">${title}</span><span class="speaker-company">${mark}${company}</span></span></div>`;
  }).join("\n");
  let flyer = "";
  if (config.flyer !== null) {
    if (!config.flyer || typeof config.flyer !== "object") throw new Error("flyer must be an object or null");
    localFile(config.flyer.image, "assets", "flyer.image", sourceRoot);
    flyer = `<div class="hero-art"><div class="flyer-frame"><img src="${escapeHtml(config.flyer.image)}" alt="${escapeHtml(text(config.flyer.alt, "flyer.alt"))}" /></div></div>`;
  }
  function content(value, field) {
    const path = localFile(value, "content", field, sourceRoot);
    if (!value.endsWith(".html")) throw new Error(`${field} must reference an HTML file`);
    return readFileSync(path, "utf8").replace(/\{\{name\}\}/g, () => escapeHtml(name));
  }
  const sessions = content(config.sessionsFile, "sessionsFile");
  const notes = config.notesFile === null ? "" : content(config.notesFile, "notesFile");
  const invitation = `Hi,\r\n\r\nI'd love for you to join us at ${name}, a community for builders to learn, share, and ship with GitHub Copilot.\r\n\r\nSchedule: ${schedule}. Everyone is welcome.\r\n\r\nLearn more and find meeting details:\r\n${publicUrl.href}\r\n\r\nHope you can join us!`;
  const values = {
    name: escapeHtml(name), description: escapeHtml(description), schedule: escapeHtml(schedule),
    heroCopy, speakers: speakers ? `<div class="speaker-row" aria-label="${escapeHtml(name)} speakers">${speakers}</div>` : "",
    flyer, sessions, notes,
    inviteUrl: escapeHtml(`mailto:?subject=${encodeURIComponent(`Join us at ${name}`)}&body=${encodeURIComponent(invitation)}`),
    heroClass: flyer ? "hero" : "hero hero-text-only",
  };
  const template = readFileSync(join(sourceRoot, "site.html"), "utf8");
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template slot: ${key}`);
    return values[key];
  });
  if (/\{\{\w+\}\}/.test(html)) throw new Error("Unresolved template slot in Guild content");
  const assets = [...new Set(Array.from(html.matchAll(/(?:src|href)=["'](assets\/[^"']+)["']/g), (match) => match[1]))];
  assets.forEach((asset) => localFile(asset, "assets", "Referenced asset", sourceRoot));
  return { html, assets };
}

export function buildSite(guild = "nyc", sourceRoot = root) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guild)) throw new Error("Guild ID must be lowercase kebab-case");
  const config = JSON.parse(readFileSync(join(sourceRoot, "guilds", `${guild}.json`), "utf8"));
  const { html, assets } = renderSite(config, sourceRoot);
  const output = join(sourceRoot, "dist");
  // Only the fixed generated output directory is replaced, after validation succeeds.
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "index.html"), html);
  assets.forEach((asset) => {
    mkdirSync(dirname(join(output, asset)), { recursive: true });
    cpSync(join(sourceRoot, asset), join(output, asset));
  });
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error("Usage: node scripts/build.mjs [guild-id]");
  const output = buildSite(process.argv[2]);
  console.log(`Built ${process.argv[2] || "nyc"} in ${output}`);
}
