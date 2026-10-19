// Word Tap: a macOS Dictionary-style lookup popup for Omarchy.
//
// Summoned with {handoff:true} by scripts/summon, on behalf of scripts/lookup-at-cursor
// (three-finger tap, run by Service.qml's tap watcher) or scripts/lookup-selection (a hotkey);
// the text itself waits in a private file, never on a command line. It asks
// scripts/dict-lookup to consult every configured source in order and renders
// each as its own section. Everything is drawn with the shell's theme tokens,
// so it follows the active Omarchy theme. Esc, click-away and right-click
// dismiss it.
//
// Derived from Look Up by keegan-sucks (MIT).

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "WordTapModel.js" as Model

Item {
  id: root

  // Wired up by the shell host.
  property var shell: null
  property var manifest: null
  property var service: null

  property bool opened: false
  property string query: ""
  property bool loading: false
  property var result: emptyResult()

  readonly property string pluginId: (manifest && manifest.id) || "stewartjarod.wordtap"
  readonly property string scriptPath: decodeURIComponent(
    Qt.resolvedUrl("scripts/dict-lookup").toString().replace(/^file:\/\//, ""))
  // Where scripts/summon leaves the text to look up (see open()).
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || ""
  readonly property string handoffPath: runtimeDir ? runtimeDir + "/wordtap/query" : ""

  // --- theme tokens (share the [menu] surface, like the emoji/clipboard popups)
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color accent: Color.accent
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  readonly property int contentMargin: Style.spacing.panelPadding
  readonly property int gap: Style.spacing.md

  readonly property int cardWidth: Math.min(Style.space(560), panel.width - Style.gapsOut * 4)
  readonly property int cardHeight: Math.min(Style.space(620), panel.height - Style.gapsOut * 4)

  function emptyResult() {
    return { query: "", word: "", found: false, sections: [], suggestions: [] }
  }

  // --- lifecycle (called by the shell host) --------------------------------
  function open(payloadJson) {
    var p = ({})
    try { p = JSON.parse(payloadJson || "{}") } catch (e) { p = ({}) }
    root.opened = true
    setQuery(String(p.handoff === true ? takeHandoff() : (p.query || "")).slice(0, 400))
    Qt.callLater(function () {
      if (cardLoader.item) cardLoader.item.focusSearch()
    })
  }

  function close() { root.opened = false }

  // Read the text scripts/summon left in $XDG_RUNTIME_DIR/wordtap/query, then empty the file so it
  // does not linger.
  function takeHandoff() {
    if (!root.handoffPath) return ""
    handoffFile.reload()
    var t = handoffFile.text()
    if (t) handoffFile.setText("")
    return t
  }

  FileView {
    id: handoffFile
    path: root.handoffPath
    blockLoading: true
    preload: false
    printErrors: false
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.pluginId)
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function setQuery(q) {
    root.query = q
    if (cardLoader.item) cardLoader.item.setText(q)
    if (q.trim().length > 0) runLookup(q)
    else { root.result = emptyResult(); root.loading = false }
  }

  // --- lookup process ------------------------------------------------------
  property string _pending: ""
  property bool _relaunch: false
  // Bound the helper so a hung or oversized subprocess can never wedge or
  // exhaust the shell process.
  readonly property int lookupTimeoutMs: 10000
  readonly property int maxOutputChars: 2000000

  function runLookup(q) {
    root._pending = q
    root.loading = true
    if (lookupProc.running) root._relaunch = true
    else _launch()
  }

  function _launch() {
    if (root._pending.trim().length === 0) { root.loading = false; return }
    // Absolute interpreter path: never resolve `bash` through an inherited PATH. The query goes in the
    // environment, which only this user can read; any local user can read a command line.
    lookupProc.environment = ({ WORDTAP_QUERY: root._pending })
    lookupProc.command = ["/usr/bin/bash", root.scriptPath]
    watchdog.restart()
    lookupProc.running = true
  }

  function _finish(r) {
    watchdog.stop()
    root.result = r
    if (root._pending && root._pending !== (r.query || "")) root._relaunch = true
    else root.loading = false
  }

  function _onResult(txt) {
    if (txt && txt.length > root.maxOutputChars) { _finish(emptyResult()); return }
    var r
    try { r = JSON.parse(txt) } catch (e) { r = emptyResult() }
    _finish(r)
  }

  Process {
    id: lookupProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._onResult(text)
    }
    onRunningChanged: {
      if (!running && root._relaunch) { root._relaunch = false; root._launch() }
    }
  }

  // Terminates a lookup that runs too long and clears the UI. Cancelling
  // _relaunch first means the async termination won't respawn it.
  Timer {
    id: watchdog
    interval: root.lookupTimeoutMs
    repeat: false
    onTriggered: {
      root._relaunch = false
      root.loading = false
      root.result = root.emptyResult()
      if (lookupProc.running) lookupProc.running = false
    }
  }

  // ------------------------------------------------------------------------
  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "wordtap"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    exclusionMode: ExclusionMode.Ignore

    // dimmed backdrop; click to dismiss
    Rectangle {
      anchors.fill: parent
      color: root.scrim
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: root.dismiss()
      }
    }

    // The card (and its text field) only exists while the popup is open, so no
    // text input lingers in the shell listening to clipboard changes.
    Loader {
      id: cardLoader
      anchors.centerIn: parent
      active: root.opened
      sourceComponent: cardComponent
    }
  }

  Component {
    id: cardComponent

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      function focusSearch() {
        searchField.forceActiveFocus()
        searchField.selectAll()
      }
      function setText(q) { if (searchField.text !== q) searchField.text = q }
      function scrollBy(dy) {
        var maxY = Math.max(0, scroller.contentHeight - scroller.height)
        scroller.contentY = Math.max(0, Math.min(maxY, scroller.contentY + dy))
      }

      Component.onCompleted: setText(root.query)

      // Swallow clicks on the card so they don't fall through to the backdrop.
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.RightButton
        onClicked: root.dismiss()
      }

      Column {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: root.gap

        // --- search row ------------------------------------------------
        Item {
          width: parent.width
          height: searchField.implicitHeight

          Text {
            id: glyph
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: root.loading ? "󰦖" : "󰍉"
            color: root.foreground
            opacity: 0.7
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
          }

          TextField {
            id: searchField
            anchors.left: glyph.right
            anchors.leftMargin: Style.spacing.sm
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            placeholderText: "Look up a word…"
            foreground: root.foreground
            accent: root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading

            onTextChanged: {
              if (text === root.query) return
              root.query = text
              debounce.restart()
            }
            onAccepted: {
              debounce.stop()
              if (text.trim().length > 0) root.runLookup(text)
            }
            Keys.onEscapePressed: function (e) {
              if (searchField.text.length > 0) root.setQuery("")
              else root.dismiss()
              e.accepted = true
            }
            Keys.onUpPressed: card.scrollBy(-Style.space(48))
            Keys.onDownPressed: card.scrollBy(Style.space(48))
            Keys.onPressed: function (e) {
              if (e.key === Qt.Key_PageUp) { card.scrollBy(-scroller.height * 0.9); e.accepted = true }
              else if (e.key === Qt.Key_PageDown) { card.scrollBy(scroller.height * 0.9); e.accepted = true }
            }
          }

          Timer {
            id: debounce
            interval: 250
            onTriggered: {
              if (searchField.text.trim().length > 0) root.runLookup(searchField.text)
              else { root.result = root.emptyResult(); root.loading = false }
            }
          }
        }

        PanelSeparator { width: parent.width }

        // --- results body ---------------------------------------------
        Flickable {
          id: scroller
          width: parent.width
          height: parent.height - y - legend.height - root.gap
          clip: true
          contentWidth: width
          contentHeight: body.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick

          Column {
            id: body
            width: scroller.width
            spacing: Style.spacing.lg

            // Empty / hint state
            Column {
              width: parent.width
              spacing: Style.spacing.sm
              visible: root.query.trim().length === 0

              Text {
                text: "󰈙"
                color: root.foreground
                opacity: 0.45
                font.family: root.fontFamily
                font.pixelSize: Style.font.displayLarge
              }
              Text {
                width: parent.width
                wrapMode: Text.Wrap
                text: Model.tapHint(root.service ? root.service.tapStatus : null)
                color: root.foreground
                opacity: 0.6
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }
            }

            // Found: one section per source, in configured order
            Repeater {
              model: root.result.found ? root.result.sections : []

              Column {
                required property var modelData
                width: body.width
                spacing: Style.spacing.sm
                visible: modelData.entries && modelData.entries.length > 0

                // source label
                Text {
                  text: (modelData.name || modelData.id || "").toUpperCase()
                  color: root.accent
                  opacity: 0.85
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                }

                Repeater {
                  model: modelData.entries

                  Column {
                    required property var modelData
                    width: body.width
                    spacing: Style.spacing.xs
                    topPadding: Style.spacing.xs

                    Text {
                      width: parent.width
                      wrapMode: Text.Wrap
                      text: modelData.headword || root.result.word
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.title
                      font.bold: true
                    }
                    Text {
                      width: parent.width
                      textFormat: Text.RichText
                      text: Model.fmtDefinition(modelData.text)
                      color: root.foreground
                      opacity: 0.92
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      wrapMode: Text.Wrap
                      lineHeight: 1.15
                    }
                  }
                }
              }
            }

            // Not found: message + "did you mean" chips
            Column {
              width: parent.width
              spacing: Style.spacing.md
              visible: !root.result.found && !root.loading && root.query.trim().length > 0

              Text {
                width: parent.width
                wrapMode: Text.Wrap
                text: "No definition for “" + root.query.trim() + "”."
                color: root.foreground
                opacity: 0.85
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
              }

              Text {
                visible: (root.result.suggestions || []).length > 0
                text: "Did you mean…"
                color: root.foreground
                opacity: 0.6
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }

              Flow {
                width: parent.width
                spacing: Style.spacing.sm
                visible: (root.result.suggestions || []).length > 0

                Repeater {
                  model: root.result.suggestions || []

                  Rectangle {
                    required property var modelData
                    radius: Style.cornerRadius
                    color: chipHover.containsMouse ? root.accent : root.selectedBackground
                    implicitWidth: chipText.implicitWidth + Style.spacing.lg * 2
                    implicitHeight: chipText.implicitHeight + Style.spacing.sm * 2

                    Text {
                      id: chipText
                      anchors.centerIn: parent
                      text: modelData
                      color: chipHover.containsMouse ? root.background : root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }
                    MouseArea {
                      id: chipHover
                      anchors.fill: parent
                      hoverEnabled: true
                      cursorShape: Qt.PointingHandCursor
                      onClicked: root.setQuery(modelData)
                    }
                  }
                }
              }
            }
          }
        }

        // --- key legend -----------------------------------------------
        Text {
          id: legend
          width: parent.width
          elide: Text.ElideRight
          text: "Enter look up · ↑↓ PgUp PgDn scroll · Esc clear / close"
          color: root.foreground
          opacity: 0.5
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
