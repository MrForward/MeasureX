# Verification environment setup

Dependency state is evidence, not an assumption. Before verification, inspect whether `node_modules` exists and record `node --version`, `npm --version`, and the SHA-256 hash of `package-lock.json` when those reads are available.

`verification_runner` never installs dependencies. If dependencies are absent, it reports `NOT INSTALLED` and does not mark any dependent command passed. Provisioning is a separate Lead/environment step:

1. confirm a clean isolated worktree and unchanged package manifest/lockfile;
2. use the existing lockfile and an approved reproducible install command;
3. record Node/npm versions, lockfile hash, exact command, timestamps, outcome, and tracked status before/after;
4. make no package or lockfile changes; and
5. stop for approval before network access or install scripts under the existing execution boundary.

If provisioning is not authorized, unavailable, changes tracked state, or cannot reproduce the lockfile, report `NOT INSTALLED` and `BLOCKED` for gates that require dependencies. Never convert source inspection, cached output, or a prior run into a current pass.
