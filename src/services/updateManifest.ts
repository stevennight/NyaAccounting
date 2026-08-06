export type GitHubReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  sizeBytes: number | null;
};

export type GitHubReleaseInfo = {
  tagName: string;
  version: string;
  name: string;
  htmlUrl: string;
  publishedAt: string | null;
  body: string;
  apkAsset: GitHubReleaseAsset | null;
};

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
};

const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVersion(value: string): ParsedVersion | null {
  const match = versionPattern.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) {
    throw new Error('只能比较稳定的 MAJOR.MINOR.PATCH 版本。');
  }
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (leftVersion[key] !== rightVersion[key]) {
      return leftVersion[key] > rightVersion[key] ? 1 : -1;
    }
  }
  return 0;
}

export function isValidGitHubRepository(value: string): boolean {
  return repositoryPattern.test(value.trim());
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`GitHub Release 缺少有效的 ${field}。`);
  }
  return value.trim();
}

export function parseGitHubRelease(value: unknown): GitHubReleaseInfo {
  if (!isRecord(value)) {
    throw new Error('GitHub Release 响应格式无效。');
  }

  const tagName = requiredString(value.tag_name, 'tag_name');
  const version = tagName.startsWith('v') ? tagName.slice(1) : tagName;
  if (!parseVersion(version)) {
    throw new Error(`GitHub Release 标签 ${tagName} 不是稳定版本。`);
  }
  const assets = Array.isArray(value.assets) ? value.assets : [];
  const apk = assets
    .filter(isRecord)
    .map((asset) => {
      const name = typeof asset.name === 'string' ? asset.name.trim() : '';
      const browserDownloadUrl =
        typeof asset.browser_download_url === 'string'
          ? asset.browser_download_url.trim()
          : '';
      const sizeBytes =
        typeof asset.size === 'number' && Number.isSafeInteger(asset.size)
          ? asset.size
          : null;
      return { name, browserDownloadUrl, sizeBytes } satisfies GitHubReleaseAsset;
    })
    .find(
      (asset) =>
        asset.name.toLowerCase().endsWith('.apk') &&
        /^https:\/\//i.test(asset.browserDownloadUrl),
    );

  return {
    tagName,
    version,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : tagName,
    htmlUrl: requiredString(value.html_url, 'html_url'),
    publishedAt:
      typeof value.published_at === 'string' ? value.published_at : null,
    body: typeof value.body === 'string' ? value.body.trim() : '',
    apkAsset: apk ?? null,
  };
}
