# Releases and updates

GitHub Actions builds Mac installers from this repository. `Checks` runs on pushes and pull requests. `Build and release` runs when a `v*` tag is pushed; manual dispatch produces downloadable workflow artifacts without publishing a release unless an existing `release_tag` is supplied. This lets you retry an unpublished tag using corrected workflow configuration without moving the tag.

## Publish a version

1. Update `package.json` and `package-lock.json` with the same semantic version.
2. Update `docs/release-notes.md`.
3. Run `npm test`, commit, and push.
4. Tag that commit (`git tag v1.2.1`) and push the tag (`git push origin v1.2.1`). The workflow verifies that the tag matches the package version, tests the app, and builds DMG and ZIP downloads for Apple Silicon and Intel.
5. Open the workflow run and release page to verify the downloads.

Installers use `GLB-Viewer-<version>-<arch>.dmg` and `.zip`. Release metadata and blockmaps accompany them for electron-updater. Never replace release files with different binaries under the same version. Publish a new version for a fix.

## Apple signing and notarization

Unsigned builds use manual updates. If you are not enrolled yet:

1. [Enroll in the Apple Developer Program](https://developer.apple.com/programs/enroll/) using your own Apple Account. Apple lists an annual fee of US$99 or local pricing and verifies your identity during enrollment.
2. After approval, follow [Apple's Developer ID certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/) to create a **Developer ID Application** certificate. This is the certificate for signing an app distributed outside the Mac App Store.
3. Keep the certificate's private key on your Mac. Export the signing identity as a password-protected `.p12` using [Xcode's certificate export flow](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html). Exporting only the `.cer` file is insufficient for CI signing.
4. Create an [app-specific password](https://support.apple.com/102654) for notarization and find your Team ID in your Apple Developer membership details.
5. Add the values below directly to **GitHub → repository Settings → Secrets and variables → Actions**. Keep private keys, certificate passwords, and app-specific passwords out of source files and chat.
6. Publish a new signed release, verify notarization on a clean Mac, and use it as the installed starting point for signed automatic updates.

For signed distribution, configure these **GitHub Actions repository secrets**:

| Secret                        | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `CSC_LINK`                    | Base64-encoded Developer ID Application certificate (`.p12`) |
| `CSC_KEY_PASSWORD`            | Certificate password                                         |
| `APPLE_ID`                    | Apple Developer account email                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password used for notarization                  |
| `APPLE_TEAM_ID`               | Apple Developer team identifier                              |

The workflow passes them to electron-builder, which signs and notarizes when credentials are available. Missing secrets are unset before packaging, so an unsigned build never attempts to read an empty certificate path. Test a signed build on a clean Mac before describing a release as signed/notarized. A paid Apple Developer membership and a valid Developer ID certificate are external requirements; the repository cannot create them.

GitHub's built-in `GITHUB_TOKEN` publishes releases. No personal access token is embedded in the app. The app reads public GitHub release metadata and opens only this repository's release URLs.

## Update behavior

- Packaged apps check for updates shortly after startup. Users can also choose **Updates** in the header or **Check for updates** in the Mac menu.
- Only newer stable semantic versions are offered. Missing releases and network failures are handled explicitly.
- A Developer ID-signed build enables electron-updater downloads. The user chooses when to download and when to restart; active optimization or batch work blocks installation.
- Unsigned/development builds link to GitHub Releases for manual installation. Replacing the app retains Electron user data: presets, recipes, budgets, and history.
- Local models stay local. Update checks contact GitHub; no model files are uploaded.

References: [electron-builder auto updates](https://www.electron.build/v26/docs/features/auto-update/), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
