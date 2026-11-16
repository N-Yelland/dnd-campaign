#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const yaml = require("../assets/vendor/js-yaml.min.js");

const defaultRoot = path.resolve(__dirname, "../content");

function readMetadata(header) {
  const parsed = yaml.safeLoad(header);
  const metadata = parsed == null ? {} : parsed;
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("YAML front matter must be a mapping.");
  }
  if (metadata.child_pages !== undefined &&
      (!Array.isArray(metadata.child_pages) || metadata.child_pages.some((child) => typeof child !== "string"))) {
    throw new Error("child_pages must be a list of paths.");
  }
  return metadata;
}

function updateSource(source, children, file) {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  source = source.slice(bom.length);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const header = source.match(/^---[^\S\r\n]*\r?\n([\s\S]*?)(?=^---[^\S\r\n]*(?:\r?\n|$))/m);
  if (!header || header.index !== 0) {
    if (/^---/.test(source)) throw new Error("Unclosed YAML front matter.");
    const name = path.basename(path.dirname(file)).replace(/[-_]+/g, " ");
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    const metadata = yaml.safeDump({ title, child_pages: children }, { lineWidth: -1 });
    return bom + `---${newline}${metadata.replace(/\n/g, newline)}---${newline}${newline}${source}`;
  }

  const metadata = readMetadata(header[1]);
  // The filesystem defines membership; the old list only determines display order.
  const available = new Set(children);
  const ordered = [...new Set(metadata.child_pages || [])].filter((child) => available.has(child));
  const retained = new Set(ordered);
  ordered.push(...children.filter((child) => !retained.has(child)));
  if (isDeepStrictEqual(metadata.child_pages, ordered)) return bom + source;

  const block = ordered.length
    ? ["child_pages:", ...ordered.map((child) => `  - ${yaml.safeDump(child, { lineWidth: -1 }).trimEnd()}`)]
    : ["child_pages: []"];
  const lines = header[1].split(/(?<=\n)/);
  const start = lines.findIndex((line) => /^(?:child_pages|'child_pages'|"child_pages"):[ \t]*/.test(line));
  if (start === -1 && Object.hasOwn(metadata, "child_pages")) {
    throw new Error("Use a top-level child_pages: field in block-style YAML.");
  }
  let end = start + 1;
  if (start !== -1) {
    // YAML also permits list items aligned with the top-level field.
    while (end < lines.length && !/^[^\s#]/.test(lines[end].replace(/^-(?:\s|$)/, "  "))) end++;
    // Keep blank lines and comments that follow the old list.
    while (end > start + 1 && /^[ \t]*(?:#.*)?(?:\r?\n)?$/.test(lines[end - 1])) end--;
  }
  const replacement = block.join(newline) + newline;
  if (start === -1) lines.push(replacement);
  else lines.splice(start, end - start, replacement);
  const updatedHeader = lines.join("");
  const expected = { ...metadata, child_pages: ordered };
  if (!isDeepStrictEqual(readMetadata(updatedHeader), expected)) {
    throw new Error("Updating child_pages would change other YAML metadata; simplify its YAML first.");
  }
  return bom + source.slice(0, header[0].length - header[1].length) + updatedHeader + source.slice(header[0].length);
}

function syncChildPages(root = defaultRoot, { dryRun = false, check = false } = {}) {
  const changes = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const file = path.join(directory, "index.md");
    if (!entries.some((entry) => entry.name === "index.md" && entry.isFile())) {
      throw new Error(`${file}: missing index.md; create the landing page first.`);
    }
    const children = entries.filter((entry) => entry.name !== "index.md").map((entry) => {
      if (!entry.isDirectory() && !entry.isFile()) throw new Error(`${entry.name}: unsupported filesystem entry.`);
      if (/[/\\?#%:\u0000-\u001f]/.test(entry.name) || entry.name.toLowerCase() === "index.md") {
        throw new Error(`${entry.name}: filename is incompatible with the site's child_pages links.`);
      }
      return entry.name + (entry.isDirectory() ? "/" : "");
    }).sort();
    const source = fs.readFileSync(file, "utf8");
    let updated;
    try {
      updated = updateSource(source, children, file);
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
    if (updated !== source) changes.push({ file, source: updated });
    for (const entry of entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      visit(path.join(directory, entry.name));
    }
  }
  // Validate the entire tree before writing any files.
  visit(path.resolve(root));
  if (!dryRun && !check) {
    for (const change of changes) fs.writeFileSync(change.file, change.source, "utf8");
  }
  return changes;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--help")) {
      console.log("Usage: node scripts/update-child-pages.cjs [--dry-run | --check] [--content-dir PATH]\n" +
        "\nMake every child_pages list exactly match its folder's files and directories, excluding index.md.\n" +
        "Remove stale entries, keep existing order, and append new children alphabetically.\n" +
        "--dry-run  Preview affected files without writing.\n" +
        "--check    Write nothing and exit 1 if any indexes need updating.\n" +
        "--content-dir PATH  Use another content directory (default: this repository's content/).");
    } else {
      let root = defaultRoot;
      for (let index = 0; index < args.length; index++) {
        if (args[index] === "--content-dir" && args[index + 1] && !args[index + 1].startsWith("--")) root = args[++index];
        else if (!["--dry-run", "--check"].includes(args[index])) throw new Error(`Unknown or incomplete argument: ${args[index]}`);
      }
      const preview = args.includes("--dry-run") || args.includes("--check");
      const changes = syncChildPages(root, { dryRun: preview });
      for (const { file } of changes) console.log(`${preview ? "Would update" : "Updated"} ${path.relative(process.cwd(), file)}`);
      console.log(changes.length ? `${changes.length} index file(s) ${preview ? "need updating" : "updated"}.` : "All child_pages lists are up to date.");
      if (args.includes("--check") && changes.length) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { syncChildPages };
