### Changed
- Opened at a tailnet name, the Computer view frames the PC's desktop from that PC itself, over
  https at its tailnet name, so the picture no longer travels through the PC Ovis runs on. It
  falls back to the old path when the PC can't serve it. Its settings show the round trip to the PC.
- A PC's login (a Mac's account) is kept on the device once the PC accepts it, and the next view
  signs in with it. A refused login is forgotten, and signing out forgets them all.

### Fixed
- A screen stream that Bun had to drop for a slow browser now ends and reconnects instead of
  going on with bytes missing.
- A hidden desktop no longer plays its sound, and a kept view stays with its own PC instead of
  showing up on another one's agent.
