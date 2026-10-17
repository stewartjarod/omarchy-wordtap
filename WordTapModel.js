.pragma library

// Pure helpers for WordTap.qml: no QML, no IO, so node --test can load them.

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// A dictionary entry's plain text -> lightly styled rich text.
// Derived from Look Up's Webster formatter (keegan-sucks, MIT).
function fmtDefinition(s) {
  if (!s) return ""
  var t = escapeHtml(s)
  t = t.replace(/Defn:\s*/g, "")
  // etymology / cross-references in [ ... ] -> italic
  t = t.replace(/\[([^\]]{1,160})\]/g, "<i>[$1]</i>")
  // Sense numbers -> bold headings, but only genuine ones. Webster's text is
  // full of incidental numbers (scripture citations like "Heb. xi. 6.",
  // quantities) that must not be mistaken for senses. A real sense number is
  // either the next in sequence, or a "1." restarting numbering for a new part
  // of speech. The trailing space is a lookahead so it is not consumed.
  var next = 1
  function promote(n) {
    if (n === next) { next += 1; return true }
    if (n === 1) { next = 2; return true }
    return false
  }
  t = t.replace(/^\s*(\d{1,2})\.(?=\s)/, function (m, n) {
    return promote(parseInt(n, 10)) ? "<b>" + n + ".</b>" : m
  })
  t = t.replace(/(\s+)(?:--\s+)?(\d{1,2})\.(?=\s)/g, function (m, ws, n) {
    return promote(parseInt(n, 10)) ? "<br><br><b>" + n + ".</b>" : m
  })
  // editorial labels onto their own line
  t = t.replace(/\s+(Note:|Syn\.|Usage:)\s*/g, "<br><i>$1</i> ")
  t = t.replace(/[ \t]{2,}/g, " ")
  return t.trim()
}

// The empty-state hint, given the tap watcher's last status line
// ({enabled, touchpads, readable}) or null when it has not reported yet.
function tapHint(status) {
  var fallback = "Type a word above, or select text and press your Word Tap shortcut."
  if (!status || status.enabled === false) return fallback
  if (status.touchpads === 0) return "No touchpad found. " + fallback
  if (status.readable < status.touchpads)
    return "Three-finger tap needs touchpad access: run scripts/touchpad-access enable in the plugin folder."
  return "Tap any word with three fingers, or type one above."
}

if (typeof module !== "undefined") module.exports = { escapeHtml: escapeHtml, fmtDefinition: fmtDefinition, tapHint: tapHint }
