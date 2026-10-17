import { useAppStore } from "../store";

export function StatusBar() {
  const engine = useAppStore((s) => s.engine);
  const children = useAppStore((s) => s.children);
  const loading = useAppStore((s) => s.loading);
  const pool = engine?.pool.length ?? 0;
  const current = engine?.pool[engine.current_index];
  const running = engine?.running;
  const paused = engine?.paused;
  return (
    <footer className="status">
      <span className={`dot ${running ? (paused ? "pause" : "on") : "off"}`} />
      <span>
        Wallpaper {running ? (paused ? "paused" : "running") : "stopped"} · {engine?.mode ?? "traditional"}
      </span>
      <span>Pool {pool}</span>
      <span>{current ? `Now ${current.display_name}` : "No current item"}</span>
      <span style={{ marginLeft: "auto" }}>
        {loading ? "Working…" : `${children.length} in view`}
      </span>
    </footer>
  );
}
