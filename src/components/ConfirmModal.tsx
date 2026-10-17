import { api } from "../api";
import { useAppStore } from "../store";

export function ConfirmModal() {
  const confirm = useAppStore((s) => s.confirm);
  const setConfirm = useAppStore((s) => s.setConfirm);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setToast = useAppStore((s) => s.setToast);
  if (!confirm) return null;

  return (
    <div className="modal-backdrop" onClick={() => setConfirm(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <header>
          <h3>Remove mount{confirm.ids.length > 1 ? "s" : ""}</h3>
        </header>
        <div className="body">
          <p>Default action removes only the mapping inside OpenMount. Original files stay on disk.</p>
          {confirm.deleteOriginal && (
            <p className="confirm-danger">You chose to also delete original files. This cannot be undone.</p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className={`btn ${confirm.deleteOriginal ? "danger" : "primary"}`}
              onClick={async () => {
                await api.deleteNodes(confirm.ids, confirm.deleteOriginal);
                setConfirm(null);
                await refreshAll();
                setToast(confirm.deleteOriginal ? "Mapping and original files removed" : "Mapping removed");
              }}
            >
              {confirm.deleteOriginal ? "Delete originals" : "Remove mapping"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
