### Added
- A pi pane's reply streams into the chat as pi writes it, each update drawn as it comes as pi's
  own screen draws it: its text, its thinking too where Show thinking is on, and a tool call as
  soon as the model makes it. The words an update adds start dim and settle at the next one. pi's
  ovis-model extension keeps the message so far beside the session (`<session>.live`), the server
  watches the session's folder and pushes each change (`conversation-live`) to a chat that watches
  the pane, and the finished message takes its place once the transcript holds it. Nothing streams
  to a page that is hidden or on another tab.
- A message sent from here comes out of the composer: its bubble fades in and settles once, as
  it is first read. Reduced motion leaves it still.
