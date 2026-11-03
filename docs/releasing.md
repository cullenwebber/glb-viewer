# Releases and updates

GitHub Actions builds Mac installers from this repository. `Checks` runs on pushes and pull requests. `Build and release` runs when a `v*` tag is pushed; manual dispatch produces downloadable workflow artifacts without publishing a release.

## Publish a version

1. Update `package.json` and `package-lock.json` with the same semantic version.
2. Update `docs/release-notes.md`.
3. Run `npm test`, commit, and push.
4. Tag that commit (`git tag v1.1.1`) and push the tag (`git push origin v1.1.1`). The workflow verifies that the tag matches the package version, tests the app, and builds DMG and ZIP downloads for Apple Silicon and Intel.
5. Open the workflow run and release page to verify the downloads.

Installers use `GLB-Viewer-<version>-<arch>.dmg` and `.zip`. Release metadata and blockmaps accompany them for electron-updater. Never replace release files with different binaries under the same version. Publish a new version for a fix.

## Apple signing and notarization

Unsigned builds use manual updates. For signed distribution, configure these **GitHub Actions repository secrets**:

| Secret                        | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `CSC_LINK`                    | Base64-encoded Developer ID Application certificate (`.p12`) |
| `CSC_KEY_PASSWORD`            | Certificate password                                         |
| `APPLE_ID`                    | Apple Developer account email                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password used for notarization                  |
| `APPLE_TEAM_ID`               | Apple Developer team identifier                              |

The workflow passes them to electron-builder, which signs and notarizes when credentials are available. Test a signed build on a clean Mac before describing a release as signed/notarized. A paid Apple Developer membership and a valid Developer ID certificate are external requirements; the repository cannot create them.

GitHub's built-in `GITHUB_TOKEN` publishes releases. No personal access token is embedded in the app. The app reads public GitHub release metadata and opens only this repository's release URLs.

## Update behavior

- Packaged apps check for updates shortly after startup. Users can also choose **Updates** in the header or **Check for updates** in the Mac menu.
- Only newer stable semantic versions are offered. Missing releases and network failures are handled explicitly.
- A Developer ID-signed build enables electron-updater downloads. The user chooses when to download and when to restart; active optimization or batch work blocks installation.
- Unsigned/development builds link to GitHub Releases for manual installation. Replacing the app retains Electron user data: presets, recipes, budgets, and history.
- Local models stay local. Update checks contact GitHub; no model files are uploaded.

References: [electron-builder auto updates](https://www.electron.build/v26/docs/features/auto-update/), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
