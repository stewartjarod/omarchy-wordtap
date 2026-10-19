"use strict"
// scripts/lookup-at-cursor in its testing mode (a screenshot stands in for the screen, stdin for the
// highlight): which word, or highlighted phrase, a tap at a point looks up. Needs tesseract and magick.
const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("path")
const { spawnSync } = require("child_process")

const root = path.join(__dirname, "..")
const have = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0
const skip = !(have("tesseract") && have("magick")) && "needs tesseract and imagemagick"

function tap(shot, [x, y], highlight = "") {
  const r = spawnSync("bash", [path.join(root, "scripts/lookup-at-cursor"), String(x), String(y),
    path.join(__dirname, "fixtures/phrase", shot)], { input: highlight, encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

// Word centres in each fixture (px). "New York City" is highlighted in both.
const AT = {
  "light-mono.png": { moved: [399, 9], York: [500, 11], City: [540, 10], Berlin: [764, 8] },
  "dark-sans.png": { moved: [551, 8], York: [633, 8], City: [662, 10], Berlin: [804, 8] },
}

for (const [shot, at] of Object.entries(AT)) {
  test(`${shot}: a tap on a highlighted phrase looks up the phrase`, { skip }, () => {
    assert.equal(tap(shot, at.York, "New York City"), "New York City")
    assert.equal(tap(shot, at.City, "New York\nCity "), "New York City")
  })

  test(`${shot}: with no highlight, or one elsewhere, a tap looks up its word`, { skip }, () => {
    assert.equal(tap(shot, at.moved), "moved")
    assert.equal(tap(shot, at.moved, "New York City"), "moved")
    assert.equal(tap(shot, at.Berlin, "New York City"), "Berlin")
    assert.equal(tap(shot, at.York, "York"), "York")
  })

  test(`${shot}: the phrase must read the same on screen`, { skip }, () => {
    assert.equal(tap(shot, at.Berlin, "the Berlin Wall"), "the Berlin Wall")
    assert.equal(tap(shot, at.Berlin, "the Berlin Airlift"), "Berlin")
  })
}

test("accents.png: an accented phrase, read without its accent, still matches", { skip }, () => {
  const at = { Hotel: [48, 8], de: [75, 8], Ville: [98, 8], Limoges: [153, 10] }
  for (const w of ["Hotel", "de", "Ville"]) assert.equal(tap("accents.png", at[w], "Hôtel de Ville"), "Hôtel de Ville", w)
  assert.equal(tap("accents.png", at.Limoges, "Hôtel de Ville"), "Limoges")
})
