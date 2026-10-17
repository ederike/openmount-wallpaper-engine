import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { useAppStore } from "../store";

export function Toolbar() {
  const t = useT();
  const viewMode = useAppStore((s) => s.viewMode);
  const engine = useAppStore((s) => s.engine);
  const query = useAppStore((s) => s.query);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setQuery = useAppStore((s) => s.setQuery);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const applyEngine = useAppStore((s) => s.applyEngine);
  const setToast = useAppStore((s) => s.setToast);

  async function mountFolder() {
    const folder = await open({ directory: true, multiple: false, title: t("dialogMountFolder") });
    if (typeof folder !== "string") return;
    await api.mountPath(folder, currentFolderId);
    await refreshAll();
    setToast(t("toastMountedFolder"));
  }

  async function mountFiles() {
    const picked = await open({
      multiple: true,
      title: t("dialogMountFiles"),
      filters: [
        {
          name: t("mediaFilter"),
          extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif", "mp4", "mkv", "mov", "webm", "avi"],
        },
      ],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const path of paths) {
      await api.mountPath(path, currentFolderId);
    }
    if (paths.length) {
      await refreshAll();
      setToast(`${t("toastMountedFiles")} ${paths.length}`);
    }
  }

  async function refresh() {
    const report = await api.refresh(currentFolderId);
    await refreshAll();
    setToast(`${t("refresh")} · +${report.added} / -${report.removed} / !${report.missing}`);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="/11.png" alt="" />
        <div className="brand-name">
          <strong>OpenMount</strong>
          <span>{t("brandSub")}</span>
        </div>
      </div>
      <button className="btn primary" onClick={() => void mountFolder()}>
        <Icon name="mount" /> {t("mountFolder")}
      </button>
      <button className="btn" onClick={() => void mountFiles()}>
        {t("files")}
      </button>
      <button className="btn" onClick={() => void refresh()}>
        <Icon name="refresh" /> {t("refresh")}
      </button>
      <div className="search">
        <Icon name="search" />
        <input
          id="omwe-search"
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void refreshAll();
          }}
        />
      </div>
      <div className="seg" aria-label="View">
        <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title={t("listView")}>
          <Icon name="list" />
        </button>
        <button className={viewMode === "thumb" ? "active" : ""} onClick={() => setViewMode("thumb")} title={t("thumbView")}>
          <Icon name="grid" />
        </button>
      </div>
      <div className="seg" aria-label="Language">
        <button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>
          {t("langZh")}
        </button>
        <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
          {t("langEn")}
        </button>
      </div>
      <div className="toolbar-spacer" />
      <button className="btn" onClick={() => void api.prev().then(applyEngine)} title={t("prev")}>
        <Icon name="prev" />
      </button>
      <button className="btn primary" onClick={() => void api.playPause().then(applyEngine)}>
        <Icon name={engine?.running && !engine.paused ? "pause" : "play"} />
        {engine?.running && !engine.paused ? t("pause") : t("playWallpaper")}
      </button>
      <button className="btn" onClick={() => void api.next().then(applyEngine)} title={t("next")}>
        <Icon name="next" />
      </button>
      <button className="btn ghost" onClick={() => void api.stop().then(applyEngine)} title={t("stopWallpaper")}>
        <Icon name="stop" />
      </button>
      <button className="btn icon-btn" onClick={() => setSettingsOpen(true)} title={t("settings")}>
        <Icon name="settings" />
      </button>
    </header>
  );
}
