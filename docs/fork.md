# Fork boundaries

This fork is `ricardofelixb/ovis`; upstream is `devswha/ovis`. This inventory compares the starting commit `da5afc54` with its upstream merge base, `2decd453d6a28eb6cf21647c6f928150d1196c5c`. It includes inherited fork changes, not just this refactor.

## Three piles

- **A: reusable changes.** Upstream PR candidates, not submitted. Optional presentation features should arrive upstream disabled; protocol correctness fixes should retain their focused tests rather than acquire a switch.
- **B: preferences.** Ricardo's choice of layout, density and interaction, not a new upstream default. Each extracted preference has an existing or new Settings control.
- **C: installation-specific integration.** Omarchy's theme hook and the fork's distribution/deployment wiring. Keep these outside the default experience. Xiaomi's adb address and the VPS service belong only in `scripts/deploy-vps.ts`, not browser defaults.

A file can contain more than one pile. The inventory below lists every upstream-owned file modified or deleted at the starting commit, including scripts, native code and documentation outside `src/`, `server/` and `shared/`.

### Upstream PR candidates (pile A)

| Candidate | Fork implementation | Existing contract / opt-in |
| --- | --- | --- |
| Pi live voice and floating call orb | `src/fork/piVoiceSession.ts`, `src/fork/PiVoiceView.tsx`, `src/fork/VoiceOrb.tsx`, `server/fork/pi-voice.ts` | Settings: Pi live voice. Existing Pi wire validation stays in `shared/pi-voice.ts`. Never bypass observe, origin or device-revocation checks. |
| Computer view | `src/fork/ComputerView.tsx`, `src/fork/computerSettings.ts`, `server/fork/screen.ts` | Settings: Computer view. Bridge configuration remains `OVIS_SCREEN_*`; a browser toggle is not an authorization boundary. |
| Repository pull requests | `src/fork/PullRequestsDialog.tsx`, `server/fork/pull-requests.ts` | Settings: Pull requests. Reuses repository/worktree routes and `gh`; no GitHub account or remote changes. |
| Reply read-aloud | `src/fork/SpeakButton.tsx`, `src/fork/speech.ts`, `server/fork/speech.ts` | Settings: Read aloud, with the existing voice selector. No engine/model download until requested. |
| Model picker, context popover and branch-aware composer context | `src/fork/ContextRing.tsx`, `src/fork/ComposerContext.tsx`, `src/fork/modelMark.ts` | Settings: Composer extras. The upstream noninteractive context ring and desktop folder/branch strip remain the default. |
| Compact work runs | `src/fork/workRuns.tsx` | Settings: Compact work runs. Upstream work blocks remain the default. |
| Live previews, reveal pacing and send motion | `src/fork/liveTurn.ts`, `src/fork/streamReveal.ts`, `src/fork/chatPresentation.ts` | Settings: Animated replies. Upstream accepted-send follow remains the default. |
| Agent friends and optional tab naming | `src/fork/AgentFriend.tsx`, `src/fork/TabFriends.tsx`, `src/fork/friends.ts`, `server/fork/friends.ts` | Settings: Agent friends and Agent names on tabs. Existing explicitly named tabs are never renamed. |
| Persistent branch names in the header | `src/fork/HeaderBranch.tsx`, `src/fork/branchStorage.ts` | Settings: Branch in the header. Branch storage is neither read nor written with this option off. |
| Offline-PC collapsing and extra sidebar actions | Small guarded branches in `src/components/MachineSidebar.tsx` and `src/components/AgentSidebar.tsx` | Settings: Collapse offline PCs and Sidebar pane actions. |
| Generic runtime fixes | Conversation deltas, receipt whitespace, hidden-page throttling, independent machine reconnect, source bridges, favicon discovery, terminal/IME fixes | These fix transport or data interpretation, not personal layout. Their coupled upstream integrations and tests are retained; see limits below. |
| Portable native improvements | Android call lifecycle, notification permissions, friend pictures and multi-window handling | Native-app contribution candidates. They are not Xiaomi-only changes. Native files were not rewritten by this refactor. |

### Preferences (pile B)

New devices use upstream behavior. Migrated devices retain the previous fork behavior.

| Preference | New device | Migrated fork device | Control |
| --- | --- | --- | --- |
| Phone tabs | Row | Header, unless explicitly chosen otherwise | Existing Phone tabs setting |
| Angular boxes | Rounded | Square | Square corners |
| Lens control | Header buttons | Toggle in More | View toggle in More |
| Tab titles | Upstream auto-title rules | Prefer agent/session names and explicit tab labels in sidebar rows | Agent names on tabs |
| Sidebar pictures | Agent marks | Friend pictures | Agent friends |
| Composer | Upstream context strip and ring | Interactive context/model controls | Composer extras |
| Work blocks | Upstream blocks | Counted compact runs | Compact work runs |
| Chat previews and send-follow | Upstream transcript/follow rules | Live reveal, pop animation and immediate follow | Animated replies |
| Extra views/actions | Absent | Pi voice, Computer, PRs and read-aloud available | Their individual feature switches |
| Header context | Upstream workspace context | Branch and repository context | Branch in the header |
| Offline PCs | Listed | Folded | Collapse offline PCs |
| Prompt cards | Upstream height | Taller | Taller prompt cards |
| Phone tab row during keyboard resize | Upstream cramped-height media query | Hold the pre-keyboard cramped state | Keep tabs while keyboard opens |
| Tab menus | Upstream pane actions and title | One-pane tabs omit duplicate Rename/Close and show repository context | Compact tab menus |
| Sidebar pane close action | Upstream actions | Additional pane-close action | Sidebar pane actions |
| Terminal key bar | Upstream layout without Super | Existing saved layout, or the old fork layout including Super | Existing Key bar editor; adding Super is offered with Computer view |
| Context ring visibility | Visible, as upstream | Existing choice | Existing Context circle control |
| Running work starts open | Open, as upstream | Existing choice | Existing Open work while the agent runs control |

### Installation-specific code (pile C)

- `src/fork/omarchyTheme.ts`, the Omarchy row in `src/fork/SettingsRows.tsx`, and `server/fork/omarchy-themes.ts` implement Follow Omarchy. It is off by default and offered when this device has sent a theme. The hook stays in `scripts/omarchy-theme-hook.sh`. No theme colors were edited.
- `scripts/deploy-vps.ts` and `scripts/deploy-helpers.ts` retain the VPS/Xiaomi deployment workflow. This work does not deploy, restart a service, contact a phone, or change the live checkout.
- Fork source-bundle/release wiring and deployment documentation stay outside the UI extraction. They must not be proposed upstream with Ricardo's endpoints or service names.

## Settings and migration

`src/fork/settings.ts` owns fork settings, sanitization, migration, scopes, storage and root data attributes. `src/fork/SettingsRows.tsx` owns the translated controls, rendered through a small Settings-panel insertion. Upstream settings extend `ForkSettings` and spread the defaults/scope/sanitizer rather than duplicating each field.

The migration follows the existing legacy-settings approach. Only a main record containing a historical fork-only field (`contextCircle`, `speechVoice`, `liveVoice`, `followOmarchy` or `enterKey`) receives the old fork defaults. An upstream-only record, an absent record and an empty record do not. Explicit values always win, including `false`, a customized key bar, and `phoneTabs: "row"`. Existing dedicated storage keys take precedence over old values in the main record.

Fork choices also live in `ovis:fork-settings`. This protects them when an older upstream tab saves a main settings record that does not know these fields. Reads do not write storage. Reset and subsequent explicit changes persist in the fork key, so reloading cannot reapply an old default over a new choice. No server env default was added: device-local migration preserves each phone/desktop's choices without changing another install's behavior. A device with no surviving settings record cannot be identified as an old fork device; it correctly receives upstream defaults.

Translations added by fork features are collected in `src/fork/featureI18n.ts` and `src/fork/i18n*.ts`. Three locale entry points call `withForkI18n`; the upstream per-feature dictionaries and ownership tests remain unchanged. Shared labels move into the base dictionary at composition time, not by editing upstream translation files.

## Extraction boundaries

- `src/main.tsx` loads `src/fork/styles.css` after upstream styles. This imports fork chat/composer/component overrides. Presentation overrides use `data-fork-*="true"`; disabling a switch removes its styling immediately. Only two semantic radius variables are defined unconditionally, for fork-owned circular controls.
- Upstream component stylesheets were restored instead of keeping radius, work-run, speech and view-toggle rules inside them. The obsolete fork files-panel overrides were removed: upstream already owns the docked panel and resizer. Those overrides overrode `[hidden]` and double-counted the panel's width when loaded as a later stylesheet. The upstream implementation supplies the panel behavior instead.
- Fork-only public paths retain small compatibility re-exports where other fork code/tests already import them. Their implementations now live under `src/fork/` or `server/fork/`. Compatibility facades are intentionally not duplicated implementations.
- `server/fork/services.ts` constructs optional services and composes their socket handlers. `server/fork/routes.ts` dispatches screens, Pi voice, friends and speech. An unmatched route returns `null`; a successful WebSocket upgrade can resolve to `undefined`. Confusing these would continue dispatch after an upgrade.
- The screen hook remains after upstream authentication and observe checks, with its own origin check. The other hook remains after the API drive/origin/observe guards. No authorization, takeover, focus or queued-input rule was loosened. Device-local UI settings do not grant or revoke server API capabilities.
- PR handling stays behind the existing workspace route matching and remote-PC proxy guard. Omarchy event streaming stays in the authenticated PC-event handler. Moving either to a global pre-guard router would change its security/remote-routing semantics.

### Deliberately retained upstream integration

A small import-and-call is possible for a self-contained component, not for every addition to an existing state machine. These remaining diffs are recorded rather than hidden behind new abstractions:

1. `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/PaneCanvas.tsx` and `src/components/PaneTerminal.tsx` retain view selection, retained Computer state, voice mount points, branch props and menu wiring. They share selection/focus, restored-pane and responsive-header state. A single catch-all fork hook would need most of App's state and callbacks, increasing the integration surface rather than reducing it.
2. `src/components/Composer.tsx` retains the Pi model/reasoning menu and a few branch/context props. Their lifecycle is coupled to existing metadata, send state and menus. Rendering/context components and CSS are extracted; the remaining state was not rewritten.
3. `src/components/ChatView.tsx` and `src/components/ChatTimeline.tsx` retain live-row identity, read reconciliation, footer/scroll anchoring and transcript-layout fixes. Compact runs, speech, motion and reveal helpers are extracted. Moving the remaining timeline changes would require replacing the upstream reader/virtualizer, not a behavior-preserving module move. The upstream stopped-send effect and selection are restored verbatim, including their source-level test.
4. Machine connection/retry/update code, source-bundle handling, herdr-core adapters, Pi transcript/receipt parsing, native notifications and terminal lifecycle fixes retain their existing upstream integration and tests. These are portable correctness changes, not fork visual defaults. They need separate upstream correctness PRs; no new transport, cache, session ownership or RPC mechanism was invented here.
5. `server/herdr-core/snapshot.ts` retains explicit `ovis.view=work` projection and related adapter behavior. The task's description of Coding/Work grouping does not correspond to a separate browser grouping implementation at the starting commit. Hiding a deliberately labelled runtime workspace is a server projection, not a device-local row preference. Per-device projection would require a new wire contract, so this code and its tests were left intact rather than adding an unused toggle.
6. The native Android call/notification changes and packaging files are outside this browser/server move. Their device permissions and lifecycle require native checks. This work does not claim to have run Android, Windows or macOS validation.
7. Existing convention-test adaptations, cross-module settings migrations, shared preference/wire fields and fixture helpers remain where their upstream owners enforce them. Generated files, tracked `.rej` files and `src/lib/fixtures-input-rows/**` recordings are unchanged.

## Regression ownership

Upstream `scripts/*-regression.ts` and `scripts/*-qa.ts` previously adapted to fork-only controls were restored to the merge-base versions. Fork preference/migration coverage lives in `scripts/fork-preferences-regression.ts`, registered with the browser runner. Pure migration, model-mark, compact-run, branch-storage and chat-presentation regressions live under `src/fork/`.

The browser runner uses the CI image and a `git ls-files` tar, isolated test sessions and temporary state. Standalone upstream QA scripts absent from the serial lane are registered only inside the disposable verification snapshot, not added to normal CI. The SSH-profile QA needs its external SSH fixture and is explicitly excluded from the local parallel batch. See the validation appendix for exact scope and results.

## Size measurement

The command requested in the task counts **all changed paths**, including added files. Use name-status to distinguish collision-bearing upstream files from fork-owned additions:

```sh
base=$(git merge-base HEAD upstream/main)
git diff --name-only "$base" HEAD -- src server shared | wc -l
git diff --name-status "$base" HEAD -- src server shared
```

At the starting commit: **176 modified upstream files, 82 added fork files and 2 deleted upstream files** (260 paths). After extraction: **123 modified upstream files, 131 added fork files, no deletions** (254 paths). This removes 53 modified-file collision surfaces and restores both deleted upstream modules. The merge check is recorded with validation below. Restoring an upstream file removes a collision surface; adding a fork module does not create one.

## Complete starting-file inventory

The following inventory is a static record of this refactor, not a release manifest. `Restored` means byte-identical to the upstream merge-base file; `Retained` includes both small hooks and the coupled changes explained above. Test/script classifications follow the feature they exercise; restoring them is not removal of that feature.

| Pile | State | Starting upstream files |
| --- | --- | --- |
| A | Restored | `scripts/agent-entry-points-demo-regression.ts`<br>`scripts/agent-skill-menu-demo-regression.ts`<br>`scripts/agy-chat-browser-qa.ts`<br>`scripts/chat-fallback-browser-qa.ts`<br>`scripts/chat-gjc-streaming-browser-qa.ts` |
| A | Restored | `scripts/chat-greeting-demo-regression.ts`<br>`scripts/chat-history-browser-qa.ts`<br>`scripts/chat-local-send-follow-demo-regression.ts`<br>`scripts/chat-size-regression.ts`<br>`scripts/chat-tool-paths-demo-regression.ts` |
| A | Restored | `scripts/chat-virtual-browser-qa.ts`<br>`scripts/chat-working-line-demo-regression.ts`<br>`scripts/claude-image-browser-qa.ts`<br>`scripts/command-outcome-demo-regression.ts`<br>`scripts/composer-draft-demo-regression.ts` |
| A | Restored | `scripts/composer-fit-demo-regression.ts`<br>`scripts/copilot-chat-browser-qa.ts`<br>`scripts/copilot-image-browser-qa.ts`<br>`scripts/deep-link-demo-regression.ts`<br>`scripts/default-view-regression.ts` |
| A | Restored | `scripts/devin-chat-browser-regression.ts`<br>`scripts/droplet-demo-regression.ts`<br>`scripts/file-viewer-regression.ts`<br>`scripts/files-documents-demo-regression.ts`<br>`scripts/files-panel-demo-regression.ts` |
| A | Restored | `scripts/font-swap-demo-regression.ts`<br>`scripts/grok-chat-browser-qa.ts`<br>`scripts/grok-image-browser-qa.ts`<br>`scripts/health-flap-demo-regression.ts`<br>`scripts/herdr-profiles-ssh-qa.ts` |
| A | Restored | `scripts/hide-pc-demo-regression.ts`<br>`scripts/machines-browser-qa.ts`<br>`scripts/mobile-viewport-regression.ts`<br>`scripts/new-session-skills-browser-qa.ts`<br>`scripts/notification-view-regression.ts` |
| A | Restored | `scripts/omo-question-wheel-regression.ts`<br>`scripts/omp-codex-image-browser-qa.ts`<br>`scripts/pane-find-regression.ts`<br>`scripts/pane-lifetime-regression.ts`<br>`scripts/pane-paging-demo-regression.ts` |
| A | Restored | `scripts/pending-pane-switch-regression.ts`<br>`scripts/phone-back-demo-regression.ts`<br>`scripts/pi-image-browser-qa.ts`<br>`scripts/prompt-card-timing-demo-regression.ts`<br>`scripts/secret-input-regression.ts` |
| A | Restored | `scripts/sidebar-activity-demo-regression.ts`<br>`scripts/split-view-regression.ts`<br>`scripts/sticky-modifiers-regression.ts`<br>`scripts/tap-targets-demo-regression.ts`<br>`scripts/terminal-arrows-clicks-regression.ts` |
| A | Restored | `scripts/terminal-autoswitch-demo-regression.ts`<br>`scripts/terminal-ghostty-demo-regression.ts`<br>`scripts/terminal-input-regression.ts`<br>`scripts/terminal-ipad-ime-regression.ts`<br>`scripts/terminal-keyboard-suggestions-regression.ts` |
| A | Restored | `scripts/update-browser-qa.ts`<br>`scripts/workspace-rows-regression.ts`<br>`scripts/workspace-touch-reorder-demo-regression.ts`<br>`src/components/AgentMark.test.tsx`<br>`src/components/AgentMark.tsx` |
| A | Restored | `src/conventions.test.ts`<br>`src/lib/composerStrip.test.ts`<br>`src/lib/composerStrip.ts`<br>`src/lib/i18n.test.ts`<br>`src/lib/i18n/chat.ja.ts` |
| A | Restored | `src/lib/i18n/chat.ko.ts`<br>`src/lib/i18n/chat.zh.ts`<br>`src/lib/i18n/composer.ja.ts`<br>`src/lib/i18n/composer.ko.ts`<br>`src/lib/i18n/composer.zh.ts` |
| A | Restored | `src/lib/i18n/files.ja.ts`<br>`src/lib/i18n/files.ko.ts`<br>`src/lib/i18n/files.zh.ts`<br>`src/lib/i18n/machines.ja.ts`<br>`src/lib/i18n/machines.ko.ts` |
| A | Restored | `src/lib/i18n/machines.zh.ts`<br>`src/lib/i18n/settings.ja.ts`<br>`src/lib/i18n/settings.ko.ts`<br>`src/lib/i18n/settings.zh.ts`<br>`src/lib/i18n/sidebar.ja.ts` |
| A | Restored | `src/lib/i18n/sidebar.ko.ts`<br>`src/lib/i18n/sidebar.zh.ts`<br>`src/lib/i18n/terminal.ja.ts`<br>`src/lib/i18n/terminal.ko.ts`<br>`src/lib/i18n/terminal.zh.ts` |
| A | Restored | `src/lib/i18n/workspace.ja.ts`<br>`src/lib/i18n/workspace.ko.ts`<br>`src/lib/i18n/workspace.zh.ts`<br>`src/lib/keyBar.test.ts`<br>`src/lib/workBlocks.test.ts` |
| A | Restored | `src/lib/workBlocks.ts`<br>`src/components/ChatTurn.test.ts`<br>`scripts/composer-fit-harness.ts`<br>`scripts/skill-menu-cases/claude-terminal.ts` |
| A | Retained | `app/android/app/src/main/AndroidManifest.xml`<br>`app/android/app/src/main/java/sh/ovis/app/HerdrShellPlugin.java`<br>`app/android/app/src/main/java/sh/ovis/app/MainActivity.java`<br>`app/android/ovis-push/build.gradle`<br>`app/android/ovis-push/src/main/java/sh/ovis/push/OvisMessagingService.java` |
| A | Retained | `app/android/ovis-push/src/main/res/values/strings.xml`<br>`app/web/error.html`<br>`app/web/index.html`<br>`index.html`<br>`public/sw.js` |
| A | Retained | `scripts/background-agent-detail-demo-run.ts`<br>`scripts/ci-browser-timings.json`<br>`scripts/ci-browser.sh`<br>`scripts/ci-browser.test.ts` |
| A | Retained | `scripts/film/capture.ts`<br>`scripts/omp-question-compat.ts`<br>`scripts/pane-mute-demo-run.ts`<br>`scripts/plugin.test.ts`<br>`scripts/plugin.ts` |
| A | Retained | `scripts/release-guards.ts`<br>`scripts/server-artifact.ts`<br>`scripts/source-scan.ts`<br>`server/auth.ts` |
| A | Retained | `server/bridge.ts`<br>`server/compiled-server.contract.test.ts`<br>`server/conventions.test.ts`<br>`server/conversation-metadata.test.ts`<br>`server/conversation-metadata.ts` |
| A | Retained | `server/conversation-monitor.ts`<br>`server/conversation.ts`<br>`server/core/connections.test.ts`<br>`server/core/status.ts`<br>`server/core/terminals.ts` |
| A | Retained | `server/dispatch.ts`<br>`server/hc-machines.test.ts`<br>`server/herdr-core/adapter.test.ts`<br>`server/herdr-core/adapter.ts`<br>`server/herdr-core/machine-bridge.ts` |
| A | Retained | `server/herdr-core/snapshot.test.ts`<br>`server/herdr-core/snapshot.ts`<br>`server/index.ts`<br>`server/install-lock.test.ts`<br>`server/machine-api.test.ts` |
| A | Retained | `server/machine-api.ts`<br>`server/machine-core-choice.test.ts`<br>`server/machine-events.contract.test.ts`<br>`server/machine-events.ts`<br>`server/machine-herdr-choice.test.ts` |
| A | Retained | `server/machine-herdr-switch-retry.test.ts`<br>`server/machine-independent-reconnect.test.ts`<br>`server/machine-own-update.test.ts`<br>`server/machine-update.test.ts`<br>`server/machines.test.ts` |
| A | Retained | `server/machines.ts`<br>`server/pane-routes.ts`<br>`server/pc-install.test.ts`<br>`server/pi-delivery.test.ts`<br>`server/pi-delivery.ts` |
| A | Retained | `server/pi.test.ts`<br>`server/pi.ts`<br>`server/project-favicon.test.ts`<br>`server/project-favicon.ts`<br>`server/push.test.ts` |
| A | Retained | `server/push.ts`<br>`server/remote-host.ts`<br>`server/request-log.test.ts`<br>`server/static.test.ts`<br>`server/static.ts` |
| A | Retained | `server/statusline-context.test.ts`<br>`server/transcript-records.ts`<br>`server/windows-native.test.ts`<br>`server/workspace-routes.ts`<br>`shared/machines.ts` |
| A | Retained | `shared/preferences.ts`<br>`shared/protocol.ts`<br>`shared/push.ts`<br>`shared/workspace-lifecycle.ts`<br>`site/demo/index.html` |
| A | Retained | `site/demo/transport.ts`<br>`src/components/Droplet.tsx`<br>`src/components/FilePanelResizer.tsx`<br>`src/components/KeyBar.tsx` |
| A | Retained | `src/components/KeyBarSettings.tsx`<br>`src/components/RowMenu.tsx`<br>`src/components/SentWaiting.tsx`<br>`src/components/SettingsDialog.tsx`<br>`src/components/Sidebar.appLayout.test.tsx` |
| A | Retained | `src/lib/api.ts`<br>`src/lib/compose.test.ts`<br>`src/lib/compose.ts`<br>`src/lib/droplet.ts`<br>`src/lib/filePanelWidth.test.ts` |
| A | Retained | `src/lib/filePanelWidth.ts`<br>`src/lib/keyBar.ts`<br>`src/lib/keys.ts`<br>`src/lib/machineContext.tsx`<br>`src/lib/nativeApp.ts` |
| A | Retained | `src/lib/notificationTarget.ts`<br>`src/lib/notifications.test.ts`<br>`src/lib/notifications.ts`<br>`src/lib/paneBranch.ts`<br>`src/lib/settings.legacy-fixture.ts` |
| A | Retained | `src/lib/themeBoot.test.ts`<br>`src/lib/themeBoot.ts`<br>`src/lib/themes.ts`<br>`src/lib/useAlertSignals.ts`<br>`src/lib/useMachineRoster.ts` |
| A | Retained | `src/lib/useNotifications.ts`<br>`src/lib/usePaneAttach.hook.test.ts`<br>`src/lib/useSelection.ts`<br>`src/lib/useSidebarLayout.ts`<br>`src/lib/useTabReorder.ts` |
| A | Retained | `src/lib/useTerminalMount.ts`<br>`src/lib/useTerminalRefits.hook.test.ts`<br>`src/lib/useTerminalRefits.ts`<br>`src/lib/useWorktreeBranches.ts`<br>`src/lib/webPanel.test.ts` |
| A | Retained | `src/lib/webPanel.ts`<br>`src/lib/worktreeBranches.test.ts`<br>`src/lib/worktreeBranches.ts`<br>`src/pwa-notification.test.ts`<br>`vite.config.ts` |
| A+B | Restored | `scripts/header-context-demo-regression.ts`<br>`scripts/header-lens-switch-regression.ts`<br>`scripts/inbox-mode-demo-regression.ts`<br>`scripts/key-bar-customization-demo-regression.ts`<br>`scripts/mobile-tabs-regression.ts` |
| A+B | Restored | `scripts/phone-glass-header-demo-regression.ts`<br>`scripts/settings-pages-demo-regression.ts`<br>`scripts/sidebar-declutter-demo-regression.ts`<br>`scripts/sidebar-filter-demo-regression.ts`<br>`scripts/sidebar-peek-demo-regression.ts` |
| A+B | Restored | `scripts/ui-regression.ts`<br>`src/components/AgentSidebar.css`<br>`src/components/AgentSidebar.test.ts`<br>`src/components/ChatView.css`<br>`src/components/ChatView.stoppedTurn.test.ts` |
| A+B | Restored | `src/components/Composer.css`<br>`src/components/PaneCanvas.css`<br>`src/components/TabStrip.css` |
| A+B | Retained | `src/components/AgentSidebar.test.tsx`<br>`src/components/AgentSidebar.tsx`<br>`src/components/ChatTimeline.test.tsx`<br>`src/components/ChatTimeline.tsx`<br>`src/components/ChatView.tsx` |
| A+B | Retained | `src/components/Composer.tsx`<br>`src/components/MachineSidebar.loading.test.tsx`<br>`src/components/MachineSidebar.test.ts`<br>`src/components/MachineSidebar.tsx`<br>`src/components/PaneCanvas.appLayout.test.tsx` |
| A+B | Retained | `src/components/PaneCanvas.tsx`<br>`src/components/PaneTerminal.tsx`<br>`src/components/TabStrip.appLayout.test.tsx`<br>`src/components/TabStrip.tsx`<br>`src/lib/sidebarAgents.test.ts` |
| A+B | Retained | `src/lib/sidebarAgents.ts` |
| A+B+C | Restored | `src/lib/settings.hook.test.ts`<br>`src/styles.css` |
| A+B+C | Retained | `src/App.tsx`<br>`src/components/Sidebar.tsx`<br>`src/lib/settings.test.ts`<br>`src/lib/settings.ts`<br>`src/lib/i18n.ja.ts`<br>`src/lib/i18n.ko.ts`<br>`src/lib/i18n.zh.ts` |
| A+C | Retained | `DESIGN.md`<br>`THIRD_PARTY_NOTICES.md`<br>`app/android/ovis-push/README.md`<br>`docs/guide.md`<br>`docs/herdr-core-layout.md` |
| A+C | Retained | `docs/native-app.md`<br>`docs/remote-pcs.md` |
| B | Restored | `src/components/AccountApprovalPrompt.css`<br>`src/components/AgentSetupCard.css`<br>`src/components/AgentsSettings.css`<br>`src/components/Droplet.css`<br>`src/components/FilesDialog.css` |
| B | Restored | `src/components/Machines.css`<br>`src/components/PromptCard.css`<br>`src/components/RowMenu.css`<br>`src/components/SettingsControls.css`<br>`src/components/SetupGuide.css` |
| B | Restored | `src/components/Sidebar.css`<br>`src/components/UsageSettings.css`<br>`src/components/VoiceInput.css` |
| C | Retained | `.github/workflows/remote-bundles.yml`<br>`AGENTS.md`<br>`scripts/build-remote-bundle.ts`<br>`server/remote-bundle.test.ts`<br>`server/remote-bundle.ts` |

Total inventoried: **284 upstream-owned paths** (282 modified and 2 deleted at the starting commit). The 148 originally added paths are fork-owned and do not collide with an upstream path; their feature families are described above.

## Local validation

No push, PR, merge, deployment or native-device check was performed. All browser builds ran in `herdr-ci-runner:local`, as its normal user, with only a disposable snapshot and verification-artifact mount. The live checkout and services were not used.

### Scoped commands

The host client command (exit 0, 424 tests across 22 files):

```sh
TMPDIR=$HOME/.cache/ovis-tmp/fork-sep bun test src/fork/*.test.ts src/fork/*.test.tsx src/lib/settings.test.ts src/lib/settings.hook.test.ts src/lib/i18n.test.ts src/lib/workBlocks.test.ts src/lib/composerStrip.test.ts src/lib/keyBar.test.ts src/lib/sidebarAgents.test.ts src/conventions.test.ts src/components/AgentSidebar.test.ts src/components/AgentSidebar.test.tsx src/components/ChatTurn.test.ts src/components/ChatView.stoppedTurn.test.ts src/components/TabStrip.appLayout.test.tsx src/components/PaneCanvas.appLayout.test.tsx src/components/AgentMark.test.tsx
```

The isolated CI-image server command (exit 0, 84 tests across 9 files):

```sh
bun run check run bun test --timeout 15000 server/pi-voice.test.ts server/pi-voice.contract.test.ts server/start-screen.test.ts server/start-screen.contract.test.ts server/speech.test.ts server/friends.test.ts server/route-envelope.contract.test.ts server/pull-requests.test.ts server/conventions.test.ts
```

The initial host attempt at the server command was refused by preflight (exit 1: `this needs herdr on PATH (or OVIS_HERDR_BIN)`); it ran no server tests. The same check wrapper was then used successfully in the image. No real herdr or hc session was substituted on the host.

At the initial separation checkpoint, `bun run check fast` and whole-project type checks were skipped under the implementer instructions. The explicitly authorized follow-up below records their later results. Native and full-suite checks were not run. The required browser preparation (`bun install --frozen-lockfile`, `bun run build`) ran successfully inside the image, not on the host.

### Fixture typecheck follow-up

The follow-up reproduced nine type errors with `TMPDIR=$HOME/.cache/ovis-tmp/fork-sep-type-fix bun run typecheck` (exit 1). Chat-presentation fixtures now include `ts: null`, menu fixtures include a Lucide `icon`, and the pinned legacy-settings type excludes newer fork fields without adding them to its runtime record. `speechVoice` remains because that field existed in the pinned version. No app behavior or setting default changed.

After these fixes:

- `TMPDIR=$HOME/.cache/ovis-tmp/fork-sep-type-fix bun run typecheck` exited 0.
- `TMPDIR=$HOME/.cache/ovis-tmp/fork-sep-type-fix bun test src/fork/chatPresentation.test.ts src/fork/tabMenus.test.tsx src/lib/settings.test.ts src/lib/settings.hook.test.ts` exited 0, with 147 passing tests. `src/lib/settings.test.ts` is the only importer of the legacy fixture.
- One `bun run check fast` ran in `herdr-ci-runner:local`, using a `git ls-files` tar, `bun install --frozen-lockfile` and a committed disposable git snapshot, without using the live checkout. It exited 1 after passing workflow syntax, generated-file freshness, typecheck and build. Unit results were 17,434 pass, 11 fail, 57 skip across 985 files.
- The failures were three menu expectations in `src/components/Sidebar.appLayout.test.tsx`, which still expect the now-opt-in `pull-requests` item, and eight tests in `src/lib/useWorktreeBranches.hook.test.ts`, which throw `useSettings needs a SettingsProvider above it`. Each file was rerun alone in the image on both the corrected snapshot and the pre-fix commit `dbb90bb7`; all four commands exited 1 with the same 3/8 failure split. These pre-existing branch failures were reported, not changed in this fixture-only fix. No second full fast run was made.

Logs, the JSON report and the runnable `fast.sh` / `compare.sh` recipes are retained at `$HOME/.cache/ovis-verification/fork-sep-type-fix-e3cd58/`. The fast container used CPUs 0-3 because this Docker daemon exposes only CPUs 0-7; the initial request for CPUs 64-95 was rejected before a container or check started. Browser regressions were not rerun for these fixture-only edits.

### Browser commands and results

All batches used the same container recipe:

```sh
mkdir -p "$HOME/.cache/ovis-tmp/fork-sep"
git ls-files -z | tar --null -T - -cf "$HOME/.cache/ovis-tmp/fork-sep/snapshot.tar"
docker run --entrypoint bash -v "$HOME/.cache/ovis-tmp/fork-sep:/input" herdr-ci-runner:local /input/<batch>.sh
```

Inside the container each batch unpacks the tar, installs from the lockfile, initializes a disposable git snapshot, builds, then runs:

```sh
BROWSER_SCRIPTS=<comma-separated scripts> BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/<batch>-results bun scripts/ci-browser-parallel.ts
```

The standalone QA scripts not present in upstream's serial list were registered only in the disposable snapshot. The initial keyboard batch hit that selector guard (exit 1: `Not in scripts/ci-browser.sh: scripts/keyboard-viewport-demo-regression.ts`), then was rerun with the same temporary registration. The SSH-profile QA was not run: it requires its external SSH fixture.

| Batch | Exact inner selector / command | Exit and result |
| --- | --- | --- |
| Restored upstream scripts and feature regressions | `BROWSER_SCRIPTS="$(grep -v herdr-profiles-ssh-qa /input/restored-scripts.txt \| paste -sd, -),scripts/fork-preferences-regression.ts,scripts/chat-size-regression.ts,scripts/composer-fit-demo-regression.ts,scripts/header-context-demo-regression.ts,scripts/chat-tool-paths-demo-regression.ts,scripts/chat-working-line-demo-regression.ts" BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/restored-results bun scripts/ci-browser-parallel.ts` | 1: 59/68 passed; failures were either fixed and rerun below or reproduced on the starting commit. |
| Default ordering, send-follow and key bar | `BROWSER_SCRIPTS=scripts/sidebar-filter-demo-regression.ts,scripts/chat-local-send-follow-demo-regression.ts,scripts/fork-preferences-regression.ts,scripts/key-bar-customization-demo-regression.ts BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/defaults-final-results bun scripts/ci-browser-parallel.ts` | 0: 4/4 passed. |
| Baseline comparison, current result | `BROWSER_SCRIPTS=scripts/agent-skill-menu-demo-regression.ts,scripts/inbox-mode-demo-regression.ts,scripts/machines-browser-qa.ts,scripts/pane-lifetime-regression.ts,scripts/sidebar-activity-demo-regression.ts,scripts/sidebar-peek-demo-regression.ts,scripts/ui-regression.ts,scripts/update-browser-qa.ts BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/current-final-results bun scripts/ci-browser-parallel.ts` | 1: sidebar activity passed; pane/menu, skill helper and keyboard-hook regressions were fixed afterwards. |
| Baseline comparison, `da5afc54` | Same eight-script selector with `CHECK_DIR=/input/base-final-results`, unpacking a tar of `da5afc54`, not the worktree | 1: 4/8 passed; the same four unrelated failures below. |
| Final pane/menu and restored helpers | `BROWSER_SCRIPTS=scripts/pane-lifetime-regression.ts,scripts/agent-skill-menu-demo-regression.ts,scripts/composer-fit-demo-regression.ts,scripts/fork-preferences-regression.ts BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/last-results bun scripts/ci-browser-parallel.ts` | 0: 4/4 passed. |
| Final keyboard/defaults | `BROWSER_SCRIPTS=scripts/inbox-mode-demo-regression.ts,scripts/phone-glass-header-demo-regression.ts,scripts/keyboard-viewport-demo-regression.ts,scripts/fork-preferences-regression.ts BROWSER_WORKERS=4 BROWSER_RETRY=0 CHECK_DIR=/input/keyboard-results bun scripts/ci-browser-parallel.ts` | 0: 4/4 passed (inbox 294.3s, phone header 18.6s, viewport 9.0s, fork preferences 15.8s). |

Red/green checks caught and fixed the default key bar, context strip, accepted-send following, sidebar tab-name ordering and live refresh, compact tab menus, a remaining fork-only skill-menu helper, and keyboard-aware cramped sizing. For the latter, a filtered copy of the original inbox test reproduced `{"short":52,"controls":[]}`; changing only the cramped hook to upstream's media-query hook passed. Replacing ChatView or ChatTimeline alone did not. The normal default now uses the upstream hook; migrated devices retain the old keyboard-aware hook. The fork regression checks both sides of a focused 900px-to-650px keyboard resize, not just the settings flag.

Four browser checks remain blocked independently of this refactor. The same eight-script command was run against `da5afc54`; no unrelated fixes or weakened assertions were added:

| Check | Starting commit and current failure |
| --- | --- |
| `scripts/machines-browser-qa.ts` | `TypeError: path must be a string or a file descriptor`, `ERR_INVALID_ARG_TYPE`, at the standalone fixture-path setup. |
| `scripts/update-browser-qa.ts` | `Updated process never became active`. |
| `scripts/ui-regression.ts` | `Start uses the folder Browse is showing`: `~/ci-tmp/.../made-here` versus `/home/runner/ci-tmp/.../made-here`. |
| `scripts/sidebar-peek-demo-regression.ts` | `hover: Timeout 30000ms exceeded` on `.agent-list .agent-item[data-pane="w1C:p1"] .agent-select`, which is not visible. |

Validation artifacts, the runnable container scripts, and `check-command-history.md` (the exact check/preparation commands and their tool exit codes, including red checks) are retained outside the temporary test root at `$HOME/.cache/ovis-verification/fork-sep-e3cd58/`. The temporary test root is removed after verification. The report is evidence of scoped checks, not a claim that the full suite is green.

### Merge dry run

`git merge --no-commit --no-ff upstream/main` exited **0**, with no conflicts, against upstream `0a91d1438b1979ac6bb9c5bd7705e60542ad47a1`. `git merge --abort` exited **0** and restored the job branch; nothing was merged or pushed. `git diff --check` exited **0**. Generated files, tracked `.rej` files and fixture recordings have no diff from `da5afc54`.

### Self-audit

- Correctness: checked upstream defaults, migration precedence, explicit false/reset values, hook ordering, route fallthrough and WebSocket upgrades. Restored-file inventory was checked byte-for-byte.
- Security: no new dependencies or credentials. Authentication, origin and observe guards retain their route order; device revocation still closes screen/voice sockets. UI preferences are not access controls. No automatic input, focus or takeover was introduced.
- Performance: fork listeners/polling are disabled with their features; the steady-keyboard listeners are not subscribed by default. No new transcript rebuild, PTY ownership or cache was added.
- Clarity/scope: small compatibility facades are intentional; moved large modules were not gratuitously rewritten. Pure helpers and optional controls have focused unit or browser coverage. No Bigpowers plan/state files were created. The skill's spec-output and project-wide-check requirements are superseded by this task's explicit instructions.
- The tempting shortcut was to treat all failed browsers as baseline failures. The baseline comparison instead identified the new menu/helper/keyboard failures, which were fixed; only the four reproduced failures above remain blocked.
