"use strict"
// The looked-up text may be a highlighted password, and any local user can read every process's
// command line in /proc/<pid>/cmdline. So the text, and everything derived from it, must reach
// helpers through stdin, the environment or a private file, never their arguments.
// (Reported for Phone Sessions in omacom/omarchy-plugin-marketplace#12100; same class here.)
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const root = path.join(__dirname, "..")
const read = (f) => fs.readFileSync(path.join(root, f), "utf8")
const RUNTIME = ["scripts/dict-lookup", "scripts/lookup-at-cursor", "scripts/lookup-selection", "scripts/summon"]

test("jq gets no query-derived --arg/--argjson values", () => {
  // Only provider metadata and a boolean may go on jq's command line.
  const allowed = new Set(["$pid", "$name", "$found"])
  for (const f of RUNTIME)
    for (const m of read(f).matchAll(/--arg(?:json)?\s+\w+\s+"([^"]*)"/g))
      assert.ok(allowed.has(m[1]), `${f}: jq argument ${m[0]}`)
})

test("sqlite3 reads its SQL from stdin", () => {
  const s = read("scripts/dict-lookup")
  const calls = [...s.matchAll(/"\$SQLITE3"[^\n]*/g)].map((m) => m[0])
  assert.ok(calls.length > 0)
  for (const c of calls) assert.match(c, /^"\$SQLITE3" "\$db"( 2>\/dev\/null.*)?$/, c)
  assert.doesNotMatch(s, /"\$SQLITE3" "\$db" \\\n\s*"SELECT/)
})

test("curl reads its URL from a config on stdin", () => {
  // A call may continue over several lines ("\" at the end of a line).
  const calls = [...read("scripts/dict-lookup").matchAll(/"\$CURL"(?:[^\n]*\\\n)*[^\n]*/g)].map((m) => m[0])
  assert.ok(calls.length > 0)
  for (const c of calls) {
    assert.match(c, / -K - /, c)
    assert.doesNotMatch(c, /\$url/, c)
  }
})

test("the shell is summoned with a fixed payload; the text waits in a private file", () => {
  for (const f of RUNTIME)
    for (const m of read(f).matchAll(/shell summon [^\n]*/g))
      assert.equal(m[0], `shell summon "$plugin_id" '{"handoff":true}'`, f)
  assert.match(read("scripts/summon"), /XDG_RUNTIME_DIR/)
})

test("summon --take returns the waiting text once, then nothing", () => {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), "wordtap-run-"))
  try {
    fs.mkdirSync(path.join(run, "wordtap"), { mode: 0o700 })
    const take = () => spawnSync("bash", [path.join(root, "scripts/summon"), "--take"],
      { env: { XDG_RUNTIME_DIR: run }, encoding: "utf8" })
    for (const word of ["first", "second"]) {
      fs.writeFileSync(path.join(run, "wordtap/query"), word, { mode: 0o600 })
      const r = take()
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout, word)
      assert.deepEqual(fs.readdirSync(path.join(run, "wordtap")), [])
    }
    assert.equal(take().stdout, "")
  } finally {
    fs.rmSync(run, { recursive: true, force: true })
  }
})

test("the popup passes the query to dict-lookup in the environment", () => {
  const qml = read("WordTap.qml")
  const cmd = qml.match(/lookupProc\.command = \[[^\]]*\]/)
  assert.ok(cmd)
  assert.doesNotMatch(cmd[0], /_pending|query/i)
  assert.match(qml, /lookupProc\.environment = \(\{ WORDTAP_QUERY: root\._pending \}\)/)
})

test("dict-lookup takes the query from WORDTAP_QUERY (and still from $1 by hand)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wordtap-argv-"))
  try {
    fs.mkdirSync(path.join(home, "config/wordtap"), { recursive: true })
    fs.writeFileSync(path.join(home, "config/wordtap/config.json"), '{"sources":["webster1913"]}')
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache") }
    const lookup = (args, extra) => {
      const r = spawnSync("bash", [path.join(root, "scripts/dict-lookup"), ...args], { env: { ...env, ...extra }, encoding: "utf8" })
      assert.equal(r.status, 0, r.stderr)
      return JSON.parse(r.stdout)
    }
    const a = lookup([], { WORDTAP_QUERY: "Running," })
    assert.equal(a.query, "Running,")
    assert.equal(a.word, "running")
    assert.equal(a.found, true)
    assert.equal(a.sections[0].id, "webster1913")
    assert.ok(a.sections[0].entries.length > 0)
    assert.equal(lookup(["serendipitous"], {}).query, "serendipitous")
    // Accented letters are letters ("hôtel", not "h tel"), whatever the caller's locale.
    const acc = lookup([], { WORDTAP_QUERY: "Hôtel de Ville", LC_ALL: "C" })
    assert.equal(acc.query, "Hôtel de Ville")
    assert.equal(acc.word, "hôtel")
    const none = lookup([], { WORDTAP_QUERY: " ;; " })
    assert.deepEqual(none, { query: " ;; ", word: "", found: false, sections: [], suggestions: [] })
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test("every helper keeps the files it writes private (umask 077)", () => {
  for (const f of [...RUNTIME, "scripts/ocr-accents"]) assert.match(read(f), /^umask 077\b/m, f)
})

test("the tap position stays off command lines (grim and awk get it on stdin / in the environment)", () => {
  const s = read("scripts/lookup-at-cursor")
  assert.match(s, /\| grim -g - /)
  assert.doesNotMatch(s, /grim -g "/)
  assert.doesNotMatch(s, /-v (px|py|ox|abox|box)=/)
})
