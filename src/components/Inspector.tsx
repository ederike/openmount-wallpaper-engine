import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { formatBytes, formatModified, kindLabel } from "../lib/format";
import { useAppStore } from "../store";

export function Inspector() {
  const children = useAppStore((s) => s.children);
  const tree = useAppStore((s) => s.tree);
  const inspectId = useAppStore((s) => s.inspectId);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setToast = useAppStore((s) => s.setToast);
  const view = children.find((n) => n.id === inspectId) ?? null;
  const folder = tree.find((n) => n.id === inspectId) ?? null;
  const node = view ?? folder;

  if (!node) {
    return (
      <aside className="inspector">
        <div className="pane-title">Inspector</div>
        <div className="inspector-body">
          <p className="empty">Select a mount node to inspect mapping, playback, and detection.</p>
        </div>
      </aside>
    );
  }

  async function rename(displayName: string) {
    await api.rename(node!.id, displayName);
    await refreshAll();
  }

  async function relocate() {
    const picked = await open({
      directory: node!.is_folder,
      multiple: false,
      title: "Relocate original path",
    });
    if (typeof picked !== "string") return;
    await api.relocate(node!.id, picked);
    await refreshAll();
    setToast("Path updated");
  }

  return (
    <aside className="inspector">
      <div className="pane-title">Inspector</div>
      <div className="inspector-body">
        <div className="field">
          <label>Display name</label>
          <input
            type="text"
            defaultValue={node.display_name}
            key={node.id}
            onBlur={(e) => {
              if (e.target.value !== node.display_name) void rename(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label>Original path</label>
          <div className="value">{node.original_path}</div>
        </div>
        <div className="field">
          <label>Kind</label>
          <div className="value">
            {view ? `${kindLabel(view)}${view.exists ? "" : " · missing"}` : "Folder"}
          </div>
        </div>
        <div className="field">
          <label>Size / modified</label>
          <div className="value">
            {formatBytes(view?.size)} · {formatModified(view?.modified_at)}
          </div>
        </div>
        <label className="switch">
          In playback pool
          <input
            type="checkbox"
            checked={node.selected}
            onChange={(e) => void api.setSelected([node.id], e.target.checked).then(() => refreshAll())}
          />
        </label>
        {node.is_folder && (
          <>
            <label className="switch">
              Continuous detection
              <input
                type="checkbox"
                checked={node.continuous_detection}
                onChange={(e) =>
                  void api.setDetection(node.id, e.target.checked, node.detection_locked).then(() => refreshAll())
                }
              />
            </label>
            <label className="switch">
              Lock detection (ignore parent)
              <input
                type="checkbox"
                checked={node.detection_locked}
                onChange={(e) =>
                  void api.setDetection(node.id, node.continuous_detection, e.target.checked).then(() => refreshAll())
                }
              />
            </label>
          </>
        )}
        <button className="btn" onClick={() => void relocate()}>Relocate original</button>
      </div>
    </aside>
  );
}
