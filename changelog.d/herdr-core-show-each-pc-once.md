### Fixed
- On herdr-core, a computer added both as an SSH or relay PC and as a herdr-core machine
  (`hc machine add`) shows once, as the SSH or relay PC with its files and chat history; the core's
  machine shows again if that PC is removed.
- On herdr-core, terminals labeled `ovis.view=work` are not shown anywhere in Ovis (workspaces,
  Other terminals, Agents, alerts or attention counts); they keep running and `hc attach` still reaches them.
