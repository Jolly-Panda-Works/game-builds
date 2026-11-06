# Jolly Panda game builds

Public build and binary-distribution repository for Jolly Panda Android games. Source repositories can remain private. No desktop builds. This repository NEVER submits releases to Bazaar or Myket.

Register each game in games.json with its repository, unique id and Iranian-store branch. Create an environment named exactly that id. Environment secrets: `SOURCE_DEPLOY_KEY` (a dedicated read/write SSH deploy key installed ONLY on the source repository, write is needed to tag), `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Optional environment variables: BAZAAR_RSA_KEY, MYKET_PUBLIC_KEY. Each game has isolated credentials; no account-wide personal token is needed. Never accept arbitrary source repository or shell commands as workflow inputs.

The source must implement the game-template contract. Set its repository variable BUILD_MODE=central to disable duplicate private builds. Add topic tgbot to the builder and source repositories. Its private-source key must never be committed. Only trusted maintainers may edit source/build scripts. Public logs and released APKs/web bundles can expose packaged JavaScript/assets; they are not source-code encryption.

The schedule polls registered branches every 15 minutes (GitHub may delay schedules). Manual Run workflow selects one registered game or all. Each game is serialized. A source revision with an existing completed release is skipped. Changes are built, Android package and signatures checked, the exact private source is tagged stores-vX.Y.Z, and APK/AAB/checksums are released here as <game-id>-stores-vX.Y.Z. A failed run before release can retry the same tagged version. Source tagging and public release use different scoped credentials.

For a new game, replicate the environment and add a registration. This test uses a separate disposable TEST signing key, not any production game's signing key. Store API tokens are deliberately absent. The Android emulator smoke workflow downloads a Bazaar release APK, installs and launches it, checks its process, and saves a screenshot and logcat as evidence.

GitHub currently documents free standard hosted runners in public repositories. Its terms also require workloads to relate to the repository's software project; this is the studio's game build/distribution project, but GitHub has not expressly guaranteed this private-source pattern. This test establishes technical behavior, not a permanent billing-policy guarantee. Self-hosted builds/private quota remain alternatives.
