import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { Icon } from "./Icon";
import { useAppStore } from "../store";

export function Toolbar() {
  const viewMode = useAppStore((s) => s.viewMode);
  const engine = useAppStore((s) => s.engine);
  const query = useAppStore((s) => s.query);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setQuery = useAppStore((s) => s.setQuery);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const applyEngine = useAppStore((s) => s.applyEngine);
  const setToast = useAppStore((s) => s.setToast);

  async function mountFolder() {
    const folder = await open({ directory: true, multiple: false, title: "Mount folder" });
    if (typeof folder !== "string") return;
    await api.mountPath(folder, currentFolderId);
    await refreshAll();
    setToast("Folder mounted");
  }

  async function mountFiles() {
    const picked = await open({
      multiple: true,
      title: "Mount files",
      filters: [
        {
          name: "Media",
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
      setToast(`Mounted ${paths.length} file${paths.length > 1 ? "s" : ""}`);
    }
  }

  async function refresh() {
    const report = await api.refresh(currentFolderId);
    await refreshAll();
    setToast(`Refresh · added ${report.added}, removed ${report.removed}, missing ${report.missing}`);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="/favicon.png" alt="" />
        <div className="brand-name">
          <strong>OpenMount</strong>
          <span>Wallpaper Engine</span>
        </div>
      </div>
      <button className="btn primary" onClick={() => void mountFolder()}>
        <Icon name="mount" /> Mount folder
      </button>
      <button className="btn" onClick={() => void mountFiles()}>
        Files
      </button>
      <button className="btn" onClick={() => void refresh()}>
        <Icon name="refresh" /> Refresh
      </button>
      <div className="search">
        <Icon name="search" />
        <input
          id="omwe-search"
          placeholder="Search this library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void refreshAll();
          }}
        />
      </div>
      <div className="seg" aria-label="View">
        <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title="List">
          <Icon name="list" />
        </button>
        <button className={viewMode === "thumb" ? "active" : ""} onClick={() => setViewMode("thumb")} title="Thumbnails">
          <Icon name="grid" />
        </button>
      </div>
      <div className="toolbar-spacer" />
      <button className="btn" onClick={() => void api.prev().then(applyEngine)} title="Previous">
        <Icon name="prev" />
      </button>
      <button className="btn primary" onClick={() => void api.playPause().then(applyEngine)}>
        <Icon name={engine?.running && !engine.paused ? "pause" : "play"} />
        {engine?.running && !engine.paused ? "Pause" : "Play wallpaper"}
      </button>
      <button className="btn" onClick={() => void api.next().then(applyEngine)} title="Next">
        <Icon name="next" />
      </button>
      <button className="btn ghost" onClick={() => void api.stop().then(applyEngine)} title="Stop wallpaper">
        <Icon name="stop" />
      </button>
      <button className="btn icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
        <Icon name="settings" />
      </button>
    </header>
  );
}
