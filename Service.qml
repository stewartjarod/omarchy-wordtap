import QtQuick
import Quickshell
import Quickshell.Io

// Word Tap service: one instance per shell. Runs the touchpad tap watcher
// (scripts/tap-watch) for as long as the shell runs and keeps its last status
// line for the popup's hint. The watcher itself launches the lookup.
Item {
  id: root

  // Last status line from tap-watch: {enabled, touchpads, readable}; null until it reports.
  property var tapStatus: null
  property int restarts: 0

  readonly property string watcherPath: decodeURIComponent(
    Qt.resolvedUrl("scripts/tap-watch").toString().replace(/^file:\/\//, ""))

  Process {
    id: watcher
    // Absolute interpreter path; -I ignores the environment and user site-packages.
    command: ["/usr/bin/python3", "-I", root.watcherPath]
    running: true
    stdout: SplitParser {
      onRead: function (line) {
        try { root.tapStatus = JSON.parse(line) } catch (e) { }
      }
    }
    // tap.debug lines (and any crash) go to the shell's log.
    stderr: SplitParser {
      onRead: function (line) { console.log("wordtap: " + line) }
    }
    onExited: function (code) {
      root.tapStatus = null
      root.restarts += 1
      respawn.interval = Math.min(60000, 2000 * root.restarts)
      respawn.start()
    }
  }

  // Back off when the watcher keeps dying (missing python3, bad config, ...).
  Timer {
    id: respawn
    repeat: false
    onTriggered: watcher.running = true
  }

  IpcHandler {
    target: "stewartjarod.wordtap"
    function ping(): string { return "ok" }
    function status(): string {
      return JSON.stringify({ running: watcher.running, restarts: root.restarts, tap: root.tapStatus })
    }
  }
}
