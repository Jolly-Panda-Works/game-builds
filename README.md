# Jolly Panda Android builder

Owner-approved store delivery is documented in [STORE-PUBLISHING.fa.md](STORE-PUBLISHING.fa.md). Building a release alone never authorizes a store submission. The first delivery per game/store is a draft trial, followed by a separate explicit live approval. Only signed store APKs can enter that queue.

Build registered private games on public GitHub-hosted runners and publish binaries in each SOURCE game's Releases. The build job never calls store APIs; delivery is a separate owner-approved workflow. Optional web archives are configured by each game; no desktop outputs exist.

## وضعیت و دانلود / Status and downloads

Open [Build private Android games](https://github.com/Jolly-Panda-Works/game-builds/actions/workflows/build.yml), select an execution, and open **All games - status and downloads**. Its Summary contains one row per selected game, the actual source branch, version, and direct APK/AAB/Web download links. Each matrix job also has its own Summary. The `all-games-status` artifact contains the same results as JSON.

- **Built / ساخته شد**: a new release was built and published in the source repository.
- **Unchanged / قبلاً ساخته شده**: that exact source commit already has a published release. No new APK was built; links point to the existing output.
- **Failed / ناموفق**: inspect the reported failing step. Token/checkout errors require App access; tests/build/signature errors require fixing that stage. An API outage or permission error is never treated as a missing release.
- **Cancelled or missing report**: the job was cancelled or did not produce a report; it is not counted as successful.

Use **Run workflow**, choose a registered game id (or `all`), and set `rebuild=true` only when a fresh build of unchanged source is wanted. This allocates a NEW version and does not replace an existing release. Downloads from private repositories require signing into an authorized GitHub account. Debug APKs are for testing and use a separate `.debug` application id; they are not signed store updates.

| Game id | Source branch | Outputs | Latest downloads |
|---|---|---|---|
| choo-choo-pop | Iranian-store | Bazaar, Myket, Debug | [Releases](https://github.com/Jolly-Panda-Works/choo-choo-pop/releases/latest) |
| mini-sumo | Iranian-store | Bazaar, Myket, Debug | [Releases](https://github.com/Jolly-Panda-Works/mini-sumo/releases/latest) |
| grid-rush-web | Iranian-store | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/grid-rush-web/releases/latest) |
| pirate-s-fortune | Iranian-store | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/Pirate-s-Fortune/releases/latest) |
| vazeh-peykar-3d | Iranian-store | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/vazeh-peykar-3d/releases/latest) |
| nostalgia-duel | Iranian-store | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/nostalgia-duel/releases/latest) |
| bomber-girl | main | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/Bomber-Girl/releases/latest) |
| detective-files | main | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/detective-files/releases/latest) |
| wild-guest-list | main | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/wild-guest-list/releases/latest) |
| dungeon-boom | main | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/dungeon-boom/releases/latest) |
| vazeh-peykar | main | Debug, Web | [Releases](https://github.com/Jolly-Panda-Works/vazeh-peykar/releases/latest) |

The registry intentionally excludes `game-template`, `build-pipeline-test`, and `.github`. Each new repository must be selected in the existing `jolly-panda-game-builder` App installation before its first build. `editions: ["debug"]` restricts Nostalgia Duel to Debug until its original release signing credentials are configured in the central environment; it never falls back to publishing an unsigned store APK.

Legacy web-only games use `builder: "web"` with `webBuild: "static"` or `"vite"`. The shared adapter lives in this repository, uses pinned Capacitor 8.6.0, packages tracked web runtime files or Vite's `dist`, and produces a Debug APK plus Web ZIP without changing the source repository. Static game versions come from their existing version files; npm projects retain their package version as the baseline. Existing native games continue using their own Android projects and ids. These first Android wrappers are build/signature verified; device gameplay verification is a separate smoke check.

Games using `Iranian-store` require merging release-ready changes from `main` into that branch; the builder does not merge branches automatically. Legacy web-only games track `main` directly.

## Shared GitHub App

Create an organization-owned private GitHub App. Disable webhooks and OAuth user authorization. Grant Contents read/write, keep other permissions off (Metadata read is implicit). Install on selected game repositories. Configure the builder repository variable BUILD_APP_CLIENT_ID and repository secret BUILD_APP_PRIVATE_KEY (entire PEM). Tokens are generated for one registered repository per job and revoked by the action afterward. If a target source commit changes workflows relative to the default branch, GitHub may additionally require Workflows write; do not grant unrelated permissions.

The workflows no longer use SOURCE_RELEASE_TOKEN or SOURCE_DEPLOY_KEY. Keep old credentials until the new App-based build succeeds, then revoke/remove credentials dedicated to this test. Do not run the old .local/setup-test.ps1 for new games.

## Each game

For an end-to-end retest without modifying game source, run the build workflow manually with `rebuild=true`. It allocates the next version, builds fresh APKs and publishes a new source release; existing published tags/assets are never overwritten. Scheduled runs retain their normal skip-already-built behavior.

Existing games can implement a custom `scripts/build.mjs` with `game.config.json.nativeProject=committed` to retain their established native project and application id. An empty `stores` list means Debug-only until an original release signing key is available; it must not cause a new release key to be invented. Mini Sumo retains its existing release secrets. Grid Rush retains its committed fixed debug keystore. Legacy application ids (including com.useffarahmand.vazehpeykar) are retained during migration. The smoke workflow's standalone-debug edition resolves the real launch activity from APK metadata, so applicationId suffixes do not change the activity namespace.

Create a private repository from game-template with all branches. Set game.config.json: name, slug, appId=com.jollypanda.<slug>, optional web=true. main is development, Iranian-store is the build branch. Both stores use the same package and versionCode, and the same permanent per-game signing key.

Run scripts/register-game.ps1 -GameId <id> -RepositoryName <repo-name>. This adds topic tgbot, sets BUILD_MODE=central to skip duplicate private builds, creates an environment, and updates LOCAL games.json. It does NOT install/authorize the App or create signing keys. Select the game in the App installation, then configure environment secrets KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD. Optional billing variables BAZAAR_RSA_KEY and MYKET_PUBLIC_KEY belong in that game's environment. Never reuse the disposable pipeline-test key for real games.

Commit and push games.json after completing access and signing setup. Registered branches are polled about every 15 minutes; GitHub can delay schedules. Manual workflow dispatch accepts a registered game id or all. Each game's releases are serialized. Existing completed source releases are skipped. Successful builds validate APK package/signature, tag the exact source commit stores-vX.Y.Z and publish APK/AAB/checksums in the private source repository. The public builder receives no new binary releases. Old public test releases are retained until explicitly removed.

The emulator workflow accepts a registered game id and a source release tag (e.g. stores-v0.1.0), downloads its Bazaar APK via the App, installs/launches it, and saves a screenshot/logcat evidence artifact.

## Telegram and visibility

Topic tgbot is a discovery convention, not authorization. The existing Telegram bot needs access to private source repositories to read their Releases. No duplicate Telegram sender is installed. Packaged JavaScript/assets inside APKs/web bundles remain extractable.

GitHub documents free standard hosted runners in public repositories and requires workloads to relate to the repository's project. The test verifies technical operation, not a permanent billing-policy guarantee.
