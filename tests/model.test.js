"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const path = require("path")

// `.pragma library` is not valid JavaScript for node; strip that line before evaluating.
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/^\.pragma library\s*$/m, "")
  const mod = { exports: {} }
  new Function("module", src)(mod)
  return mod.exports
}

const Model = load("WordTapModel.js")

test("fmtDefinition escapes markup before styling it", () => {
  assert.equal(Model.fmtDefinition("<b>x</b> & y"), "&lt;b&gt;x&lt;/b&gt; &amp; y")
})

test("fmtDefinition bolds sense numbers in sequence only", () => {
  assert.equal(Model.fmtDefinition("1. Not to be believed. 2. Amazing."),
    "<b>1.</b> Not to be believed.<br><br><b>2.</b> Amazing.")
  // "6." out of sequence (a citation) stays plain
  assert.equal(Model.fmtDefinition("1. A word. Heb. xi 6. More."), "<b>1.</b> A word. Heb. xi 6. More.")
})

test("fmtDefinition italicises bracketed etymology", () => {
  assert.equal(Model.fmtDefinition("[L. basis] a base"), "<i>[L. basis]</i> a base")
})

test("tapHint explains missing access and missing touchpads", () => {
  assert.match(Model.tapHint({ enabled: true, touchpads: 2, readable: 0 }), /touchpad-access enable/)
  assert.match(Model.tapHint({ enabled: true, touchpads: 0, readable: 0 }), /No touchpad found/)
  assert.match(Model.tapHint({ enabled: true, touchpads: 1, readable: 1 }), /three fingers/)
  assert.doesNotMatch(Model.tapHint(null), /three fingers/)
  assert.doesNotMatch(Model.tapHint({ enabled: false, touchpads: 1, readable: 1 }), /three fingers/)
})
