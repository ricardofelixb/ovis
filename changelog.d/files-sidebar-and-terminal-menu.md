### Added
- Browse and Changes can stay beside the pane. Choose File browser placement independently from
  individual files in Settings → Chat → File viewer; narrow windows still use a popup.
- Drag the file browser's left edge to resize it. Its width is saved separately from the preview;
  double-click the edge to reset it. The docked browser spans the full window height, with its X
  replacing the Files and More buttons above it. Browse and Changes use the available height
  instead of stopping at the popup's row limit.
### Changed
- Chat/Terminal now lives in More as a Terminal switch. Per-pane choices and the keyboard shortcut
  are unchanged.
### Fixed
- Sidebar overflow buttons keep their borderless appearance; only the Terminal switch uses the
  switch styling.
- The chat keeps following the latest message when a turn starts. The Working line moving from
  the footer into the turn shortened the page by a few pixels, which was read as scrolling away
  and turned follow off.
