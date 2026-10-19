"use strict"
// scripts/kaikki.jq turns Kaikki (Wiktionary) JSONL into popup entries. Needs jq.
const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("child_process")
const path = require("path")

const root = path.join(__dirname, "..")
function entries(word, env = {}) {
  const out = execFileSync("sh", ["-c",
    `WORDTAP_WORD="$1" jq -cs -f scripts/kaikki.jq < tests/fixtures/kaikki/"$1".jsonl`, "sh", word],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } })
  return JSON.parse(out)
}

test("word parts come from the affix template, first", () => {
  const e = entries("unbelievable")
  assert.deepEqual(e[0], { headword: "Word parts", text: "un- + believable" })
  assert.equal(e[1].headword, "unbelievable · adj")
  assert.match(e[1].text, /^1\. Not to be believed\./)
  assert.deepEqual(e.at(-1), { headword: "Etymology", text: "From un- + believable." })
})

test("multiple etymologies are numbered and the rendered tree is dropped", () => {
  const ety = entries("bass").filter((x) => x.headword.startsWith("Etymology"))
  assert.ok(ety.length >= 2)
  assert.equal(ety[0].headword, "Etymology 1")
  for (const x of ety) assert.doesNotMatch(x.text, /Etymology tree|Proto-Indo-European \*gʷem-\n/)
  assert.match(ety[0].text, /^A respelling of base/)
})

test("an inflection still yields its form-of senses", () => {
  const e = entries("berries")
  assert.equal(e[0].headword, "berries · noun")
  assert.match(e[0].text, /plural of berry/)
})

test("a word with no English entry shows its most common other language, named", () => {
  const e = entries("schön")
  assert.equal(e[0].headword, "schön · German adj")
  assert.match(e[0].text, /^1\. beautiful/)
  assert.ok(e.every((x) => !/Bavarian|Franconian/.test(x.headword)), JSON.stringify(e))
})

test("English entries win over other languages", () => {
  for (const w of ["unbelievable", "bass", "berries"])
    assert.ok(entries(w).every((x) => !/ · [A-Z]\w+ (noun|adj|verb)/.test(x.headword)), w)
})

test("WORDTAP_ENGLISH_ONLY=1 drops other languages (the cased proper-noun try)", () => {
  assert.deepEqual(entries("schön", { WORDTAP_ENGLISH_ONLY: "1" }), [])
  assert.equal(entries("bass", { WORDTAP_ENGLISH_ONLY: "1" })[0].headword, "bass · adj")
})
