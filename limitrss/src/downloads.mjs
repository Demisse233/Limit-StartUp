// Public release assets only. Shared by build-time generation and Pages Functions.
export const RELEASE_REPO = 'Demisse233/LimitRSS_Releases';
export const PLATFORM_VARIANTS = {
  mac: { arm64: 'mac-arm64', x86_64: 'mac-x86_64' },
  windows: { x64: 'windows-x64', arm64: 'windows-arm64' },
};
const suffixes = {
  'mac-arm64': 'macOS-arm64.dmg', 'mac-x86_64': 'macOS-x86_64.dmg',
  'windows-x64': 'Windows-x64.exe', 'windows-arm64': 'Windows-arm64.exe',
  ios: 'iOS.ipa', android: 'Android.apk', harmony: 'Harmony.hap',
};
export function releaseManifest(releases, now = new Date()) {
  const versions = {};
  for (const release of releases) {
    if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) continue;
    const version = release.tag_name.slice(1);
    const files = {};
    for (const [key, suffix] of Object.entries(suffixes)) {
      const name = `LimitRSS-${version}-${suffix}`;
      const asset = release.assets?.find(a => a.name === name && a.state === 'uploaded' && a.size > 0);
      if (asset) files[key] = name;
    }
    // Backward-compatible defaults; architecture-specific entries remain available.
    if (files['mac-arm64']) files.mac = files['mac-arm64'];
    if (files['windows-x64']) files.windows = files['windows-x64'];
    if (Object.keys(files).length) versions[version] = files;
  }
  const sorted = Object.fromEntries(Object.entries(versions).sort(([a], [b]) => {
    const left = a.split('.').map(Number), right = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return right[i] - left[i];
    return 0;
  }));
  return { repo: RELEASE_REPO, generatedAt: now.toISOString(), versions: sorted };
}
export function resolvePackage(manifest, platform, arch) {
  const key = arch ? PLATFORM_VARIANTS[platform]?.[arch] : platform;
  if (!key) return null;
  for (const [version, files] of Object.entries(manifest.versions || {})) {
    const fileName = files[key];
    if (fileName) return { version, fileName, url: `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${fileName}` };
  }
  return null;
}
