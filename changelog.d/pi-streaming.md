### Added
- A pi pane's reply streams into the chat as pi writes it: its text types on, its thinking too
  where Show thinking is on, and a tool call shows as soon as the model makes it. pi's ovis-model
  extension keeps the message so far beside the session (`<session>.live`), the server's watcher
  pushes it (`conversation-live`) to a chat that watches the pane, and the finished message takes
  its place once the transcript holds it. Typing steps about 15 times a second, and nothing streams
  to a page that is hidden or on another tab.
- A message sent from here comes out of the composer: its bubble fades in and settles once, as
  it is first read. Reduced motion leaves it still.
