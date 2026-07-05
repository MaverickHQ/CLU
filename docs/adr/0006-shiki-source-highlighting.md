# ADR-0006: shiki for source-code highlighting in the viewer

**Status:** Accepted · **Date:** 2026-06-29

The viewer pane is half the cockpit and a major chunk of "what does CLU look like." shiki uses TextMate grammars (the same engine VS Code uses) and produces near-IDE-quality output; highlight.js is smaller and faster but visibly less polished. The ~5 MB of grammars is acceptable in a 150 MB Electron bundle. Once we expose theme selection in app.json, switching highlighters later breaks user theme configs — so we lock now.
