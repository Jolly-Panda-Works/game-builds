# Jolly Panda Android builder

Build registered private games on public GitHub-hosted runners and publish binaries in each SOURCE game's Releases. No store API is called. Optional web archives are configured by each game; no desktop outputs exist.

## Shared GitHub App

Create an organization-owned private GitHub App. Disable webhooks and OAuth user authorization. Grant Contents read/write, keep other permissions off (Metadata read is implicit). Install on selected game repositories. Configure the builder repository variable BUILD_APP_CLIENT_ID and repository secret BUILD_APP_PRIVATE_KEY (entire PEM). Tokens are generated for one registered repository per job and revoked by the action afterward. If a target source commit changes workflows relative to the default branch, GitHub may additionally require Workflows write; do not grant unrelated permissions.

The workflows no longer use SOURCE_RELEASE_TOKEN or SOURCE_DEPLOY_KEY. Keep old credentials until the new App-based build succeeds, then revoke/remove credentials dedicated to this test. Do not run the old .local/setup-test.ps1 for new games.

## Each game

Existing games can implement a custom `scripts/build.mjs` with `game.config.json.nativeProject=committed` to retain their established native project and application id. An empty `stores` list means Debug-only until an original release signing key is available; it must not cause a new release key to be invented. Mini Sumo retains its existing release secrets. Grid Rush retains its committed fixed debug keystore. Legacy application ids (including com.useffarahmand.vazehpeykar) are retained during migration. The smoke workflow's standalone-debug edition resolves the real launch activity from APK metadata, so applicationId suffixes do not change the activity namespace.

Create a private repository from game-template with all branches. Set game.config.json: name, slug, appId=com.jollypanda.<slug>, optional web=true. main is development, Iranian-store is the build branch. Both stores use the same package and versionCode, and the same permanent per-game signing key.

Run scripts/register-game.ps1 -GameId <id> -RepositoryName <repo-name>. This adds topic tgbot, sets BUILD_MODE=central to skip duplicate private builds, creates an environment, and updates LOCAL games.json. It does NOT install/authorize the App or create signing keys. Select the game in the App installation, then configure environment secrets KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD. Optional billing variables BAZAAR_RSA_KEY and MYKET_PUBLIC_KEY belong in that game's environment. Never reuse the disposable pipeline-test key for real games.

Commit and push games.json after completing access and signing setup. Registered branches are polled about every 15 minutes; GitHub can delay schedules. Manual workflow dispatch accepts a registered game id or all. Each game's releases are serialized. Existing completed source releases are skipped. Successful builds validate APK package/signature, tag the exact source commit stores-vX.Y.Z and publish APK/AAB/checksums in the private source repository. The public builder receives no new binary releases. Old public test releases are retained until explicitly removed.

The emulator workflow accepts a registered game id and a source release tag (e.g. stores-v0.1.0), downloads its Bazaar APK via the App, installs/launches it, and saves a screenshot/logcat evidence artifact.

## Telegram and visibility

Topic tgbot is a discovery convention, not authorization. The existing Telegram bot needs access to private source repositories to read their Releases. No duplicate Telegram sender is installed. Packaged JavaScript/assets inside APKs/web bundles remain extractable.

GitHub documents free standard hosted runners in public repositories and requires workloads to relate to the repository's project. The test verifies technical operation, not a permanent billing-policy guarantee.
