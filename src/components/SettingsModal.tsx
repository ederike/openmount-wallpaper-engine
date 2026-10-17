import { save, open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api } from "../api";
import { savePlayback, useAppStore } from "../store";
import { ACTION_LABELS, PlaybackSettings, ShortcutBinding } from "../types";

export function SettingsModal() {
  const openFlag = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const engine = useAppStore((s) => s.engine);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setToast = useAppStore((s) => s.setToast);
  const [tab, setTab] = useState<"playback" | "scroll" | "keys" | "config">("playback");
  const [draft, setDraft] = useState<PlaybackSettings | null>(engine?.settings ?? null);
  const [keys, setKeys] = useState<ShortcutBinding[]>(shortcuts);

  useEffect(() => {
    setDraft(engine?.settings ?? null);
  }, [engine]);
  useEffect(() => setKeys(shortcuts), [shortcuts]);

  if (!openFlag || !draft) return null;

  const t = draft.traditional;
  const s = draft.scroll;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Settings</h3>
          <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
        </header>
        <div className="body">
          <div className="tabs">
            <button className={tab === "playback" ? "active" : ""} onClick={() => setTab("playback")}>Traditional</button>
            <button className={tab === "scroll" ? "active" : ""} onClick={() => setTab("scroll")}>Scroll</button>
            <button className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>Shortcuts</button>
            <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>Config</button>
          </div>

          {tab === "playback" && (
            <div className="grid-form">
              <label>
                Mode
                <select
                  value={draft.mode}
                  onChange={(e) => setDraft({ ...draft, mode: e.target.value as PlaybackSettings["mode"] })}
                >
                  <option value="traditional">Traditional</option>
                  <option value="scroll">Scroll canvas</option>
                </select>
              </label>
              <label>
                Order
                <select
                  value={t.order}
                  onChange={(e) => setDraft({ ...draft, traditional: { ...t, order: e.target.value as typeof t.order } })}
                >
                  <option value="custom">Folder custom order</option>
                  <option value="name_asc">Name A–Z</option>
                  <option value="name_desc">Name Z–A</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <label>
                Image dwell (ms)
                <input type="number" min={500} value={t.image_dwell_ms} onChange={(e) => setDraft({ ...draft, traditional: { ...t, image_dwell_ms: Number(e.target.value) } })} />
              </label>
              <label>
                Fade (ms)
                <input type="number" min={0} value={t.fade_ms} onChange={(e) => setDraft({ ...draft, traditional: { ...t, fade_ms: Number(e.target.value) } })} />
              </label>
              <label>
                Fill
                <select value={t.fill_mode} onChange={(e) => setDraft({ ...draft, traditional: { ...t, fill_mode: e.target.value as typeof t.fill_mode } })}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="stretch">Stretch</option>
                  <option value="tile">Tile</option>
                  <option value="center">Center</option>
                </select>
              </label>
              <label>
                Video end
                <select value={t.video_end_action} onChange={(e) => setDraft({ ...draft, traditional: { ...t, video_end_action: e.target.value as typeof t.video_end_action } })}>
                  <option value="next">Next item</option>
                  <option value="loop">Loop current</option>
                </select>
              </label>
              <label>
                Background
                <input type="color" value={t.background_color} onChange={(e) => setDraft({ ...draft, traditional: { ...t, background_color: e.target.value } })} />
              </label>
              <label className="switch">
                Fade transition
                <input type="checkbox" checked={t.fade_enabled} onChange={(e) => setDraft({ ...draft, traditional: { ...t, fade_enabled: e.target.checked } })} />
              </label>
              <label className="switch">
                Avoid consecutive repeats
                <input type="checkbox" checked={t.avoid_consecutive_repeat} onChange={(e) => setDraft({ ...draft, traditional: { ...t, avoid_consecutive_repeat: e.target.checked } })} />
              </label>
            </div>
          )}

          {tab === "scroll" && (
            <div className="grid-form">
              <label>
                Direction
                <select value={s.direction} onChange={(e) => setDraft({ ...draft, scroll: { ...s, direction: e.target.value as typeof s.direction } })}>
                  <option value="ltr">Left → right</option>
                  <option value="rtl">Right → left</option>
                </select>
              </label>
              <label>
                Speed preset (1–10)
                <input type="number" min={1} max={10} value={s.speed_preset} onChange={(e) => {
                  const preset = Math.min(10, Math.max(1, Number(e.target.value)));
                  const speeds = [8, 16, 24, 40, 64, 96, 140, 200, 280, 400];
                  setDraft({ ...draft, scroll: { ...s, speed_preset: preset, speed_px_per_sec: speeds[preset - 1] ?? s.speed_px_per_sec } });
                }} />
              </label>
              <label>
                Custom px/sec
                <input type="number" min={1} value={s.speed_px_per_sec} onChange={(e) => setDraft({ ...draft, scroll: { ...s, speed_px_per_sec: Number(e.target.value) } })} />
              </label>
              <label>
                Gap (px)
                <input type="number" min={0} value={s.gap_px} onChange={(e) => setDraft({ ...draft, scroll: { ...s, gap_px: Number(e.target.value) } })} />
              </label>
              <label>
                Opacity
                <input type="number" min={0.1} max={1} step={0.05} value={s.opacity} onChange={(e) => setDraft({ ...draft, scroll: { ...s, opacity: Number(e.target.value) } })} />
              </label>
              <label>
                Video preload (sec)
                <input type="number" min={0} value={s.preload_seconds} onChange={(e) => setDraft({ ...draft, scroll: { ...s, preload_seconds: Number(e.target.value) } })} />
              </label>
              <label className="switch">
                Loop canvas
                <input type="checkbox" checked={s.loop_enabled} onChange={(e) => setDraft({ ...draft, scroll: { ...s, loop_enabled: e.target.checked } })} />
              </label>
            </div>
          )}

          {tab === "keys" && (
            <div>
              {keys.map((row) => (
                <div className="shortcut-row" key={row.action}>
                  <span>{ACTION_LABELS[row.action] ?? row.action}</span>
                  <input
                    className="kbd"
                    value={row.accelerator}
                    onChange={(e) =>
                      setKeys(keys.map((k) => (k.action === row.action ? { ...k, accelerator: e.target.value } : k)))
                    }
                    onBlur={async (e) => {
                      try {
                        const next = await api.updateShortcut(row.action, e.target.value);
                        setKeys(next);
                      } catch (err) {
                        setToast(String(err));
                        const restored = await api.getShortcuts();
                        setKeys(restored);
                      }
                    }}
                  />
                </div>
              ))}
              <button className="btn" style={{ marginTop: 12 }} onClick={() => void api.restoreShortcuts().then(setKeys)}>
                Restore defaults
              </button>
            </div>
          )}

          {tab === "config" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={async () => {
                  const path = await save({ defaultPath: "omwe-config.json", filters: [{ name: "JSON", extensions: ["json"] }] });
                  if (path) {
                    await api.exportConfig(path);
                    setToast("Config exported");
                  }
                }}
              >
                Export config pack
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
                  if (typeof path === "string") {
                    await api.importConfig(path);
                    await refreshAll();
                    setToast("Config imported");
                  }
                }}
              >
                Import config pack
              </button>
            </div>
          )}

          {(tab === "playback" || tab === "scroll") && (
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn primary" onClick={() => void savePlayback(draft).then(() => setToast("Playback settings saved"))}>
                Save playback
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
