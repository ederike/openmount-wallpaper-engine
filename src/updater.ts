import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";

const RELEASES_API =
  "https://api.github.com/repos/ederike/openmount-wallpaper-engine/releases/latest";

export type AppUpdate = {
  current: string;
  latest: string;
  notes: string;
  htmlUrl: string;
  native: Update | null;
};

export function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function checkAppUpdate(): Promise<AppUpdate | null> {
  const current = await getVersion();
  try {
    const native = await check();
    if (native) {
      return {
        current,
        latest: native.version,
        notes: native.body ?? "",
        htmlUrl: "https://github.com/ederike/openmount-wallpaper-engine/releases/latest",
        native,
      };
    }
  } catch (err) {
    console.warn("native updater check failed", err);
  }

  const res = await fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    tag_name?: string;
    body?: string;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
  };
  if (data.draft || data.prerelease) return null;
  const latest = (data.tag_name ?? "").replace(/^v/i, "");
  if (!latest || compareVersion(latest, current) <= 0) return null;
  return {
    current,
    latest,
    notes: data.body ?? "",
    htmlUrl: data.html_url ?? "https://github.com/ederike/openmount-wallpaper-engine/releases/latest",
    native: null,
  };
}

export async function installAppUpdate(update: AppUpdate): Promise<void> {
  if (update.native) {
    await update.native.downloadAndInstall();
    await relaunch();
    return;
  }
  await openUrl(update.htmlUrl);
}
