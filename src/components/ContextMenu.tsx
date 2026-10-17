import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useT } from "../i18n";
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
  const t = useT();
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
        {t("addToPool")}
      </button>
      <button
        onClick={() => {
          void api.setSelected(ids, false).then(() => refreshAll());
          onClose();
        }}
      >
        {t("removeFromPool")}
      </button>
      <hr />
      <button
        onClick={async () => {
          const folder = await open({ directory: true, multiple: false, title: t("mountFolderHere") });
          if (typeof folder === "string") {
            await api.mountPath(folder, node.is_folder ? node.id : currentFolderId);
            await refreshAll();
          }
          onClose();
        }}
      >
        {t("mountFolderHere")}
      </button>
      <button
        onClick={async () => {
          const files = await open({
            multiple: true,
            title: t("mountFilesHere"),
            filters: [
              {
                name: t("mediaFilter"),
                extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "mp4", "mkv", "mov", "webm", "avi"],
              },
            ],
          });
          const list = Array.isArray(files) ? files : files ? [files] : [];
          for (const path of list) {
            await api.mountPath(path, node.is_folder ? node.id : currentFolderId);
          }
          await refreshAll();
          onClose();
        }}
      >
        {t("mountFilesHere")}
      </button>
      <hr />
      <button
        onClick={() => {
          setConfirm({ ids, deleteOriginal: false });
          onClose();
        }}
      >
        {t("removeMapping")}
      </button>
      <button
        onClick={() => {
          setConfirm({ ids, deleteOriginal: true });
          onClose();
        }}
      >
        {t("removeMappingAndFiles")}
      </button>
    </div>
  );
}
