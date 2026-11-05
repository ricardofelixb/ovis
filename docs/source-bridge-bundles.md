# Source-install bridge bundles

The fork keeps upstream's numeric `REMOTE_BUNDLE_VERSION` for release tags and compatibility.
A source server also identifies its bundle inputs with a 96-bit SHA-256 prefix. The runtime
identity is `<upstream version>+<hash>`. A bridge reports the identity recorded in its
`bundle.json`, not a new hash of the partial source shipped inside it.

`server/bundle-version.ts` defines the inputs shared with the release guards. They include
server and shared code, integrations, dependency pins, patches, the bundle builder and PTY
sidecar sources. Tests, fixtures, docs, Rust build output and the app's release number do not
change the identity. Identity is frozen at process start; changing a running server's checkout
requires a restart before it can build bundles for that code.

On reconnect, the existing machine manager compares runtime identities. Its existing automatic
bridge update still requires an approved machine and the automatic-update setting. It never
replaces an independently managed Ovis server, and never replaces a bridge from a newer upstream
compatibility release. Independently managed servers need their own normal source deployment.

Before installing a bundle, a source server builds a missing or stale local platform bundle
with `bun run build:remote <platform>`. Concurrent requests for that platform share the build.
The first connection can therefore take several minutes. Build failures leave a log at
`remote-bundles/build-<platform>.log` and can be retried. Unsupported cross-builds fail with the
builder's existing error rather than installing tools on the server. Source dependencies and
the client build must already be present, as they are after a normal deploy.

Explicit `OVIS_BUNDLE_MANIFEST` configuration takes precedence and never triggers a build.
Packaged runtimes also never build. Manifest and bundle metadata keep the upstream numeric
`version` and carry the fork runtime identity in `revision`; release aggregation preserves it.
Checksum verification and the existing replacement approvals still run after a local build.
