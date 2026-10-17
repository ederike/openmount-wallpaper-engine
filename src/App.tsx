import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, onEngineState, onUiEvent } from "./api";
import { translate } from "./i18n";
import { ConfirmModal } from "./components/ConfirmModal";
import { ContextMenu } from "./components/ContextMenu";
import { FileView } from "./components/FileView";
import { Inspector } from "./components/Inspector";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { UpdateBanner } from "./components/UpdateBanner";
import { useAppStore } from "./store";
import { MountNodeView } from "./types";

export default function App() {
  const refreshAll = useAppStore((s) => s.refreshAll);
  const applyEngine = useAppStore((s) => s.applyEngine);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setConfirm = useAppStore((s) => s.setConfirm);
  const highlighted = useAppStore((s) => s.highlighted);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const error = useAppStore((s) => s.error);
  const [menu, setMenu] = useState<{ x: number; y: number; node: MountNodeView } | null>(null);

  useEffect(() => {
    void refreshAll();
    const unsubs: Array<() => void> = [];
    void onEngineState(applyEngine).then((u) => unsubs.push(u));
    void onUiEvent("ui://settings", () => setSettingsOpen(true)).then((u) => unsubs.push(u));
    void onUiEvent("ui://search", () => document.getElementById("omwe-search")?.focus()).then((u) => unsubs.push(u));
    void onUiEvent("ui://refresh", () => {
      void api.refresh(useAppStore.getState().currentFolderId).then(() => refreshAll());
    }).then((u) => unsubs.push(u));
    void onUiEvent("ui://mount", () => {
      void (async () => {
        const folder = await open({
          directory: true,
          title: translate(useAppStore.getState().locale, "dialogMountFolder"),
        });
        if (typeof folder === "string") {
          await api.mountPath(folder, useAppStore.getState().currentFolderId);
          await refreshAll();
        }
      })();
    }).then((u) => unsubs.push(u));
    void onUiEvent("ui://select-all", () => {
      const ids = useAppStore.getState().children.map((c) => c.id);
      if (ids.length) void api.setSelected(ids, true).then(() => refreshAll());
    }).then((u) => unsubs.push(u));
    void onUiEvent("ui://delete", () => {
      const ids = useAppStore.getState().highlighted;
      if (ids.length) setConfirm({ ids, deleteOriginal: false });
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [applyEngine, refreshAll, setConfirm, setSettingsOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && highlighted.length) {
        setConfirm({ ids: highlighted, deleteOriginal: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [highlighted, setConfirm]);

  return (
    <div className="app" onClick={() => setMenu(null)}>
      <UpdateBanner />
      <Toolbar />
      <div className="body">
        <Sidebar />
        <FileView
          onContext={(event, node) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, node });
          }}
        />
        <Inspector />
      </div>
      <StatusBar />
      <SettingsModal />
      <ConfirmModal />
      {menu && <ContextMenu x={menu.x} y={menu.y} node={menu.node} onClose={() => setMenu(null)} />}
      {(toast || error) && <div className="toast">{toast ?? error}</div>}
    </div>
  );
}
