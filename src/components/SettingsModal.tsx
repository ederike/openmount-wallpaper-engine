import { save, open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { savePlayback, useAppStore } from "../store";
import { Locale } from "../types";
import { PlaybackSettings, ScrollOrder, ShortcutBinding } from "../types";
import { checkAppUpdate, installAppUpdate } from "../updater";

export function SettingsModal() {
  const t = useT();
  const openFlag = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const engine = useAppStore((s) => s.engine);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const thumbSize = useAppStore((s) => s.thumbSize);
  const setThumbSize = useAppStore((s) => s.setThumbSize);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setToast = useAppStore((s) => s.setToast);
  const [tab, setTab] = useState<"config" | "keys">("config");
  const [draft, setDraft] = useState<PlaybackSettings | null>(engine?.settings ?? null);
  const [keys, setKeys] = useState<ShortcutBinding[]>(shortcuts);
  const [appVersion, setAppVersion] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    setDraft(engine?.settings ?? null);
  }, [engine]);
  useEffect(() => setKeys(shortcuts), [shortcuts]);
  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  if (!openFlag || !draft) return null;

  const tr = draft.traditional;
  const sc = draft.scroll;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{t("settingsTitle")}</h3>
          <button className="btn ghost" onClick={() => setOpen(false)}>
            {t("close")}
          </button>
        </header>
        <div className="modal-body">
          <div className="tabs">
            <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>
              {t("tabConfig")}
            </button>
            <button className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>
              {t("tabShortcuts")}
            </button>
          </div>

          {tab === "config" && (
            <div className="settings-scroll">
              <h4>{t("sectionCommon")}</h4>
              <div className="grid-form">
                <label>
                  {t("language")}
                  <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                    <option value="zh">{t("langZh")}</option>
                    <option value="en">{t("langEn")}</option>
                  </select>
                </label>
                <label>
                  {t("updateCurrent")}
                  <div className="value">{appVersion || "…"}</div>
                </label>
                <label>
                  {t("updateCheck")}
                  <button
                    className="btn"
                    disabled={updateBusy}
                    onClick={async () => {
                      setUpdateBusy(true);
                      try {
                        const found = await checkAppUpdate();
                        if (!found) {
                          setToast(t("updateLatest"));
                        } else {
                          await installAppUpdate(found);
                        }
                      } catch (err) {
                        setToast(`${t("updateFailed")}: ${String(err)}`);
                      } finally {
                        setUpdateBusy(false);
                      }
                    }}
                  >
                    {updateBusy ? t("updateInstalling") : t("updateCheck")}
                  </button>
                </label>
                <label>
                  {t("previewSize")}
                  <input
                    type="range"
                    min={48}
                    max={200}
                    step={8}
                    value={thumbSize}
                    onChange={(e) => setThumbSize(Number(e.target.value))}
                  />
                  <span className="hint">{thumbSize}px</span>
                </label>
              </div>

              <h4>{t("sectionMode")}</h4>
              <div className="grid-form">
                <label className="span-2">
                  {t("mode")}
                  <select
                    value={draft.mode}
                    onChange={(e) =>
                      setDraft({ ...draft, mode: e.target.value as PlaybackSettings["mode"] })
                    }
                  >
                    <option value="traditional">{t("modeTraditional")}</option>
                    <option value="scroll">{t("modeScroll")}</option>
                  </select>
                </label>
              </div>

              {draft.mode === "traditional" ? (
                <div className="grid-form">
                  <label>
                    {t("order")}
                    <select
                      value={tr.order}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, order: e.target.value as typeof tr.order } })
                      }
                    >
                      <option value="custom">{t("orderCustom")}</option>
                      <option value="name_asc">{t("orderNameAsc")}</option>
                      <option value="name_desc">{t("orderNameDesc")}</option>
                      <option value="random">{t("orderRandom")}</option>
                    </select>
                  </label>
                  <label>
                    {t("imageDwell")}
                    <input
                      type="number"
                      min={500}
                      value={tr.image_dwell_ms}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, image_dwell_ms: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label>
                    {t("fadeMs")}
                    <input
                      type="number"
                      min={0}
                      value={tr.fade_ms}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, fade_ms: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label>
                    {t("fill")}
                    <select
                      value={tr.fill_mode}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, fill_mode: e.target.value as typeof tr.fill_mode } })
                      }
                    >
                      <option value="cover">{t("fillCover")}</option>
                      <option value="contain">{t("fillContain")}</option>
                      <option value="stretch">{t("fillStretch")}</option>
                      <option value="tile">{t("fillTile")}</option>
                      <option value="center">{t("fillCenter")}</option>
                    </select>
                  </label>
                  <label>
                    {t("videoEnd")}
                    <select
                      value={tr.video_end_action}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          traditional: { ...tr, video_end_action: e.target.value as typeof tr.video_end_action },
                        })
                      }
                    >
                      <option value="next">{t("videoEndNext")}</option>
                      <option value="loop">{t("videoEndLoop")}</option>
                    </select>
                  </label>
                  <label>
                    {t("background")}
                    <input
                      type="color"
                      value={tr.background_color}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, background_color: e.target.value } })
                      }
                    />
                  </label>
                  <label className="switch">
                    {t("fadeTransition")}
                    <input
                      type="checkbox"
                      checked={tr.fade_enabled}
                      onChange={(e) =>
                        setDraft({ ...draft, traditional: { ...tr, fade_enabled: e.target.checked } })
                      }
                    />
                  </label>
                  <label className="switch">
                    {t("avoidRepeat")}
                    <input
                      type="checkbox"
                      checked={tr.avoid_consecutive_repeat}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          traditional: { ...tr, avoid_consecutive_repeat: e.target.checked },
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="grid-form">
                  <label className="span-2">
                    {t("scrollOrder")}
                    <select
                      value={sc.order ?? "folder_custom"}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, order: e.target.value as ScrollOrder } })
                      }
                    >
                      <option value="folder_custom">{t("scrollFolderCustom")}</option>
                      <option value="folder_name">{t("scrollFolderName")}</option>
                      <option value="all_name_asc">{t("scrollAllNameAsc")}</option>
                      <option value="all_name_desc">{t("scrollAllNameDesc")}</option>
                      <option value="all_modified">{t("scrollAllModified")}</option>
                      <option value="random">{t("scrollRandom")}</option>
                    </select>
                  </label>
                  <label>
                    {t("direction")}
                    <select
                      value={sc.direction}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, direction: e.target.value as typeof sc.direction } })
                      }
                    >
                      <option value="ltr">{t("dirLtr")}</option>
                      <option value="rtl">{t("dirRtl")}</option>
                    </select>
                  </label>
                  <label>
                    {t("speedPreset")}
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={sc.speed_preset}
                      onChange={(e) => {
                        const preset = Math.min(10, Math.max(1, Number(e.target.value)));
                        const speeds = [8, 16, 24, 40, 64, 96, 140, 200, 280, 400];
                        setDraft({
                          ...draft,
                          scroll: {
                            ...sc,
                            speed_preset: preset,
                            speed_px_per_sec: speeds[preset - 1] ?? sc.speed_px_per_sec,
                          },
                        });
                      }}
                    />
                  </label>
                  <label>
                    {t("speedCustom")}
                    <input
                      type="number"
                      min={1}
                      value={sc.speed_px_per_sec}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, speed_px_per_sec: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label>
                    {t("gap")}
                    <input
                      type="number"
                      min={0}
                      value={sc.gap_px}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, gap_px: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label>
                    {t("opacity")}
                    <input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={sc.opacity}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, opacity: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label>
                    {t("videoPreload")}
                    <input
                      type="number"
                      min={0}
                      value={sc.preload_seconds}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, preload_seconds: Number(e.target.value) } })
                      }
                    />
                  </label>
                  <label className="switch">
                    {t("loopCanvas")}
                    <input
                      type="checkbox"
                      checked={sc.loop_enabled}
                      onChange={(e) =>
                        setDraft({ ...draft, scroll: { ...sc, loop_enabled: e.target.checked } })
                      }
                    />
                  </label>
                </div>
              )}

              <div className="modal-actions wrap">
                <button
                  className="btn"
                  onClick={async () => {
                    const path = await save({
                      defaultPath: "omwe-config.json",
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (path) {
                      await api.exportConfig(path);
                      setToast(t("toastExported"));
                    }
                  }}
                >
                  {t("exportConfig")}
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
                    if (typeof path === "string") {
                      await api.importConfig(path);
                      await refreshAll();
                      setToast(t("toastImported"));
                    }
                  }}
                >
                  {t("importConfig")}
                </button>
                <button
                  className="btn primary"
                  onClick={() => void savePlayback(draft).then(() => setToast(t("toastSaved")))}
                >
                  {t("savePlayback")}
                </button>
              </div>
            </div>
          )}

          {tab === "keys" && (
            <div className="settings-scroll">
              {keys.map((row) => (
                <div className="shortcut-row" key={row.action}>
                  <span>{t.action(row.action)}</span>
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
                        setKeys(await api.getShortcuts());
                      }
                    }}
                  />
                </div>
              ))}
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() =>
                  void api.restoreShortcuts().then((next) => {
                    setKeys(next);
                    setToast(t("toastShortcutsRestored"));
                  })
                }
              >
                {t("restoreShortcuts")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
