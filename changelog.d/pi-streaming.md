### Added
- A pi pane's reply streams into the chat as pi writes it: its text, its thinking too where Show
  thinking is on, and a tool call as soon as the model makes it. The words come at an even pace
  across the time until pi's next update, a whole word at a time, and each fades in; a burst (the
  first lines Claude sends at once) is drawn out over about a second. Markdown that is opened but
  not closed yet (bold, a code span, a link, a bare list marker, a table without its separator
  row) waits for its closing marks, so no raw marks flash. A chat opened mid-reply shows it as
  far as it got. pi's ovis-model extension keeps the message so far beside the session
  (`<session>.live`), the server watches the session's folder and pushes each change
  (`conversation-live`) to a chat that watches the pane, and the finished message takes its
  place once the transcript holds it. The reveal steps at most about 15 times a second, nothing
  streams to a page that is hidden or on another tab, and reduced motion leaves out the fade.
  The reply shows from its first word, tool or shown thinking, so Working stays in place until
  then, and while it streams the chat follows its end at once instead of gliding.
- A message sent from here comes out of the composer: its bubble fades in and settles once, as
  it is first read. Reduced motion leaves it still. Sending scrolls the chat to its end, so the
  message is seen arriving even from higher up.
