### Changed
- The header keeps only the tab strip: no PC › workspace › folder line, session counts, tab position,
  connection words or connection-route indicator (Tailscale, LAN, relay) beside the connection dot.
- Chat/Terminal now lives in More as a Terminal switch. Per-pane choices and the keyboard shortcut
  are unchanged.
### Fixed
- Sidebar overflow buttons keep their borderless appearance; only the Terminal switch uses the
  switch styling.
- The chat keeps following the latest message when a turn starts. The Working line moving from
  the footer into the turn shortened the page by a few pixels, which was read as scrolling away
  and turned follow off.
