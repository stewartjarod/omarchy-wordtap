"use strict"
// Feeds synthetic evdev frames to scripts/tap-watch's gesture tracker (via python3).
const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("child_process")
const path = require("path")

const script = path.join(__dirname, "..", "scripts", "tap-watch")
const harness = `
import importlib.machinery, importlib.util, json, sys
loader = importlib.machinery.SourceFileLoader("tapwatch", sys.argv[1])
spec = importlib.util.spec_from_loader("tapwatch", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)

class P(m.Pad):
    def __init__(self):  # no device: 10 units per mm
        self.res_x = self.res_y = 10.0; self.slot = 0; self.pos = {}; self.reset()

KEY, ABS = m.EV_KEY, m.EV_ABS
def touch(fingers, move_units=0, ms=100, click=False):
    p, t, out = P(), 0.0, None
    for s in range(fingers):
        p.feed(ABS, m.ABS_MT_SLOT, s, t); p.feed(ABS, m.ABS_MT_TRACKING_ID, s, t)
        p.feed(ABS, m.ABS_MT_POSITION_X, 100 * s, t); p.feed(ABS, m.ABS_MT_POSITION_Y, 100, t)
    p.feed(KEY, m.BTN_TOUCH, 1, t)
    p.feed(KEY, {1: 0x145, 2: 0x14D, 3: 0x14E, 4: 0x14F}[fingers], 1, t)
    p.feed(ABS, m.ABS_MT_SLOT, 0, t); p.feed(ABS, m.ABS_MT_POSITION_X, move_units, t)
    if click: p.feed(KEY, m.BTN_LEFT, 1, t)
    return p.feed(KEY, m.BTN_TOUCH, 0, ms / 1000)

cfg = {"fingers": 3, "max_ms": 250, "max_move_mm": 2.5}
print(json.dumps({
  "tap": m.is_tap(touch(3), cfg),
  "two": m.is_tap(touch(2), cfg),
  "swipe": m.is_tap(touch(3, move_units=300), cfg),
  "slow": m.is_tap(touch(3, ms=600), cfg),
  "press": m.is_tap(touch(3, click=True), cfg),
}))
`

test("only a quick, still, unclicked three-finger touch is a tap", () => {
  const r = JSON.parse(execFileSync("python3", ["-I", "-c", harness, script], { encoding: "utf8" }))
  assert.deepEqual(r, { tap: true, two: false, swipe: false, slow: false, press: false })
})
