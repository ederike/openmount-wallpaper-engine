import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { MountNodeView } from "../types";
import { useAppStore } from "../store";

export function ContextMenu({
  x,
  y,
  node,
  onClose,
}: {
  x: number;
  y: number;
  node: MountNodeView;
  onClose: () => void;
}) {
  const setConfirm = useAppStore((s) => s.setConfirm);
  const highlighted = useAppStore((s) => s.highlighted);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const ids = highlighted.includes(node.id) ? highlighted : [node.id];

  return (
    <div className="context-menu" style={{ left: x, top: y }} onMouseLeave={onClose}>
      <button
        onClick={() => {
          void api.setSelected(ids, true).then(() => refreshAll());
          onClose();
        }}
      >
        Add to playback pool
      </button>
      <button
        onClick={() => {
          void api.setSelected(ids, false).then(() => refreshAll());
          onClose();
        }}
      >
        Remove from playback pool
      </button>
      <hr />
      <button
        onClick={async () => {
          const folder = await open({ directory: true, multiple: false, title: "Mount folder here" });
          if (typeof folder === "string") {
            await api.mountPath(folder, node.is_folder ? node.id : currentFolderId);
            await refreshAll();
          }
          onClose();
        }}
      >
        Mount folder here
      </button>
      <button
        onClick={async () => {
          const files = await open({
            multiple: true,
            filters: [{ name: "Media", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "mp4", "mkv", "mov", "webm", "avi"] }],
          });
          const list = Array.isArray(files) ? files : files ? [files] : [];
          for (const path of list) {
            await api.mountPath(path, node.is_folder ? node.id : currentFolderId);
          }
          await refreshAll();
          onClose();
        }}
      >
        Mount files here
      </button>
      <hr />
      <button
        onClick={() => {
          setConfirm({ ids, deleteOriginal: false });
          onClose();
        }}
      >
        Remove mapping
      </button>
      <button
        onClick={() => {
          setConfirm({ ids, deleteOriginal: true });
          onClose();
        }}
      >
        Remove mapping and delete originals…
      </button>
    </div>
  );
}
