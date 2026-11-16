const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("../assets/vendor/js-yaml.min.js");
const { syncChildPages } = require("../scripts/update-child-pages.cjs");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dnd-child-pages-"));
const script = path.resolve(__dirname, "../scripts/update-child-pages.cjs");
function write(root, file, text = "") {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
const read = (root, file = "index.md") => fs.readFileSync(path.join(root, file), "utf8");
const metadata = (text) => yaml.safeLoad(text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)[1]);
const cli = (root, ...args) => spawnSync(process.execPath, [
  ...process.execArgv, script, "--content-dir", root, ...args
], { cwd: os.tmpdir(), encoding: "utf8" });

function assertTreeMatchesFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const expected = entries.filter((entry) => entry.name !== "index.md")
    .map((entry) => entry.name + (entry.isDirectory() ? "/" : "")).sort();
  const actual = metadata(read(directory)).child_pages;
  assert.deepEqual([...actual].sort(), expected, `${directory}: child_pages must exactly match the filesystem`);
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    assertTreeMatchesFiles(path.join(directory, entry.name));
  }
}

try {
  const root = path.join(temporary, "content");
  const intro = "\r\n# Introduction\r\n\r\nKeep **all** this text.\r\n";
  const header = "---\r\ntitle: 'My guide' # Keep this comment\r\nmap:\r\n  coords: [0.1, 0.2]\r\nchild_pages:\r\n  - z.md\r\n  - removed.md\r\n  - z.md\r\n\r\n# Keep this too\r\norder: 20\r\n---";
  write(root, "index.md", header + intro);
  for (const file of ["z.md", "a.md", "false", "picture.png"]) write(root, file);
  write(root, "empty-section/index.md");
  write(root, "new-section/index.md", "---\ntitle: New section\n---\n\nWelcome.\n");
  write(root, "new-section/child.md");
  write(root, "inline/index.md", "---\ntitle: Inline\nchild_pages: [old.md] # Previous list\nsummary: Keep me\n---\nBody\n");
  write(root, "inline/yes.md");
  write(root, "unindented/index.md", "---\ntitle: List\nchild_pages:\n- old.md\norder: 10\n---\n");
  write(root, "unindented/new.md");

  const preview = cli(root, "--dry-run");
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Would update/);
  assert.equal(read(root), header + intro, "Preview must not write files");
  assert.equal(cli(root, "--check").status, 1);
  assert.equal(read(root), header + intro);

  const run = cli(root);
  assert.equal(run.status, 0, run.stderr);
  const updated = read(root);
  assert.deepEqual(metadata(updated).child_pages, [
    "z.md", "a.md", "empty-section/", "false", "inline/", "new-section/", "picture.png", "unindented/"
  ]);
  assert.ok(updated.endsWith(intro));
  assert.ok(updated.includes("title: 'My guide' # Keep this comment\r\nmap:\r\n  coords: [0.1, 0.2]\r\n"));
  assert.ok(updated.includes("\r\n# Keep this too\r\norder: 20\r\n"));
  assert.ok(!/(?<!\r)\n/.test(updated), "Keep CRLF line endings");
  assert.deepEqual(metadata(read(root, "empty-section/index.md")), { title: "Empty section", child_pages: [] });
  assert.deepEqual(metadata(read(root, "new-section/index.md")).child_pages, ["child.md"]);
  assert.deepEqual(metadata(read(root, "inline/index.md")), { title: "Inline", child_pages: ["yes.md"], summary: "Keep me" });
  assert.deepEqual(metadata(read(root, "unindented/index.md")).child_pages, ["new.md"]);
  assert.deepEqual(syncChildPages(root), [], "A second run must make no changes");
  assert.equal(cli(root, "--check").status, 0);
  assertTreeMatchesFiles(root);

  // Delete previously indexed files and a directory, and move a page between folders.
  fs.unlinkSync(path.join(root, "z.md"));
  fs.unlinkSync(path.join(root, "inline/yes.md"));
  fs.unlinkSync(path.join(root, "empty-section/index.md"));
  fs.rmdirSync(path.join(root, "empty-section"));
  fs.renameSync(path.join(root, "new-section/child.md"), path.join(root, "moved.md"));
  assert.equal(cli(root, "--check").status, 1);
  assert.ok(metadata(read(root)).child_pages.includes("z.md"), "Check mode must leave stale lists untouched");
  const afterDeletion = cli(root);
  assert.equal(afterDeletion.status, 0, afterDeletion.stderr);
  assertTreeMatchesFiles(root);
  assert.ok(!metadata(read(root)).child_pages.includes("z.md"));
  assert.ok(!metadata(read(root)).child_pages.includes("empty-section/"));
  assert.ok(metadata(read(root)).child_pages.includes("moved.md"));
  assert.deepEqual(metadata(read(root, "inline/index.md")).child_pages, []);
  assert.deepEqual(metadata(read(root, "new-section/index.md")).child_pages, []);
  assert.deepEqual(syncChildPages(root), [], "Synchronizing after deletions must also be idempotent");

  const broken = path.join(temporary, "broken");
  const original = "---\ntitle: Test\nchild_pages: []\n---\nKeep this body.\n";
  write(broken, "index.md", original);
  write(broken, "child.md");
  write(broken, "nested/index.md", "---\ntitle: [invalid YAML\n---\n");
  assert.throws(() => syncChildPages(broken), /nested[\\/]index.md:/);
  assert.equal(read(broken), original, "Invalid YAML must abort before any files are written");
  write(broken, "nested/index.md", "---\ntitle: Nested\nchild_pages: wrong\n---\n");
  assert.throws(() => syncChildPages(broken), /child_pages must be a list/);
  assert.equal(read(broken), original);
  write(broken, "nested/index.md", "---\nfalse\n---\n");
  assert.throws(() => syncChildPages(broken), /front matter must be a mapping/);
  assert.equal(read(broken), original);
  fs.unlinkSync(path.join(broken, "nested/index.md"));
  assert.throws(() => syncChildPages(broken), /missing index.md/);
  assert.equal(read(broken), original);
  assert.equal(cli(root, "--unknown").status, 1);
  console.log("Passed child_pages synchronization, formatting, CLI modes, idempotence, and validation checks.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
