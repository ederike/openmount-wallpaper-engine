import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useAppStore } from "../store";

export function ConfirmModal() {
  const t = useT();
  const confirm = useAppStore((s) => s.confirm);
  const setConfirm = useAppStore((s) => s.setConfirm);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setToast = useAppStore((s) => s.setToast);
  const [deleteOriginal, setDeleteOriginal] = useState(false);

  useEffect(() => {
    setDeleteOriginal(confirm?.deleteOriginal ?? false);
  }, [confirm]);

  if (!confirm) return null;

  const alsoDelete = confirm.deleteOriginal || deleteOriginal;

  return (
    <div className="modal-backdrop" onClick={() => setConfirm(null)}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{t("confirmTitle")}</h3>
        </header>
        <div className="modal-body">
          <p>{t("confirmBody")}</p>
          <label className="switch confirm-option">
            {t("confirmDeleteOriginal")}
            <input
              type="checkbox"
              checked={alsoDelete}
              onChange={(e) => setDeleteOriginal(e.target.checked)}
            />
          </label>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              {t("cancel")}
            </button>
            <button
              className={`btn ${alsoDelete ? "danger" : "primary"}`}
              onClick={async () => {
                await api.deleteNodes(confirm.ids, alsoDelete);
                setConfirm(null);
                setDeleteOriginal(false);
                await refreshAll();
                setToast(alsoDelete ? t("toastFilesRemoved") : t("toastMappingRemoved"));
              }}
            >
              {t("confirmRemove")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
