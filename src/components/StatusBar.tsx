import { useT } from "../i18n";
import { useAppStore } from "../store";

export function StatusBar() {
  const t = useT();
  const engine = useAppStore((s) => s.engine);
  const children = useAppStore((s) => s.children);
  const loading = useAppStore((s) => s.loading);
  const pool = engine?.pool.length ?? 0;
  const current = engine?.pool[engine.current_index];
  const running = engine?.running;
  const paused = engine?.paused;
  const modeLabel = engine?.mode === "scroll" ? t("modeScroll") : t("modeTraditional");
  const runLabel = running ? (paused ? t("wallpaperPaused") : t("wallpaperRunning")) : t("wallpaperStopped");
  return (
    <footer className="status">
      <span className={`dot ${running ? (paused ? "pause" : "on") : "off"}`} />
      <span>
        {t("wallpaper")} {runLabel} · {modeLabel}
      </span>
      <span>
        {t("pool")} {pool}
      </span>
      <span>{current ? `${t("nowPlaying")} ${current.display_name}` : t("noCurrent")}</span>
      <span style={{ marginLeft: "auto" }}>
        {loading ? t("working") : `${children.length} ${t("inView")}`}
      </span>
    </footer>
  );
}
