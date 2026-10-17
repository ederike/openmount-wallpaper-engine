import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { AppUpdate, checkAppUpdate, installAppUpdate } from "../updater";

export function UpdateBanner() {
  const t = useT();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAppUpdate()
        .then((found) => setUpdate(found))
        .catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!update) return null;

  return (
    <div className="update-banner">
      <span>
        {t("updateAvailable")} {update.current} → {update.latest}
      </span>
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await installAppUpdate(update);
          } catch (err) {
            setError(String(err));
            setBusy(false);
          }
        }}
      >
        {busy ? t("updateInstalling") : t("updateNow")}
      </button>
      <button className="btn ghost" onClick={() => setUpdate(null)}>
        {t("updateLater")}
      </button>
      {error && <span className="update-error">{error}</span>}
    </div>
  );
}
