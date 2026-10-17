import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  EngineState,
  MountNode,
  MountNodeView,
  PlaybackSettings,
  RefreshReport,
  ShortcutBinding,
  SortSpec,
} from "./types";

export const api = {
  getTree: () => invoke<MountNode[]>("get_tree"),
  listChildren: (opts: {
    parentId: string | null;
    sort: SortSpec;
    query?: string;
    selectedOnly?: boolean;
    kindFilter?: string | null;
  }) =>
    invoke<MountNodeView[]>("list_children", {
      parentId: opts.parentId,
      sort: opts.sort,
      query: opts.query ?? null,
      selectedOnly: opts.selectedOnly ?? false,
      kindFilter: opts.kindFilter ?? null,
    }),
  search: (query: string) => invoke<MountNodeView[]>("search_nodes", { query }),
  mountPath: (path: string, parentId: string | null) =>
    invoke<MountNode>("mount_path", { path, parentId }),
  rename: (id: string, displayName: string) =>
    invoke<MountNode>("rename_node", { id, displayName }),
  relocate: (id: string, path: string) => invoke<MountNode>("relocate_node", { id, path }),
  reorder: (parentId: string | null, orderedIds: string[]) =>
    invoke<void>("reorder_nodes", { parentId, orderedIds }),
  setSelected: (ids: string[], selected: boolean) =>
    invoke<void>("set_selected", { ids, selected }),
  setDetection: (id: string, enabled: boolean, lock: boolean) =>
    invoke<void>("set_detection", { id, enabled, lock }),
  deleteNodes: (ids: string[], deleteOriginal: boolean) =>
    invoke<void>("delete_nodes", { ids, deleteOriginal }),
  refresh: (folderId: string | null) =>
    invoke<RefreshReport>("refresh_mounts", { folderId }),
  getEngine: () => invoke<EngineState>("get_engine"),
  getPlayback: () => invoke<PlaybackSettings>("get_playback_settings"),
  setPlayback: (settings: PlaybackSettings) =>
    invoke<EngineState>("set_playback_settings", { settings }),
  start: () => invoke<EngineState>("start_wallpaper"),
  stop: () => invoke<EngineState>("stop_wallpaper"),
  playPause: () => invoke<EngineState>("play_pause"),
  next: () => invoke<EngineState>("next_item"),
  prev: () => invoke<EngineState>("prev_item"),
  resetScroll: () => invoke<EngineState>("reset_scroll"),
  getShortcuts: () => invoke<ShortcutBinding[]>("get_shortcuts"),
  updateShortcut: (action: string, accelerator: string) =>
    invoke<ShortcutBinding[]>("update_shortcut", { action, accelerator }),
  restoreShortcuts: () => invoke<ShortcutBinding[]>("restore_shortcuts"),
  exportConfig: (path: string) => invoke<void>("export_config", { path }),
  importConfig: (path: string) => invoke<void>("import_config", { path }),
  appInfo: () => invoke<{ name: string; version: string }>("app_info"),
};

export function onEngineState(handler: (state: EngineState) => void): Promise<UnlistenFn> {
  return listen<EngineState>("engine://state", (event) => handler(event.payload));
}

export function onUiEvent(name: string, handler: () => void): Promise<UnlistenFn> {
  return listen(name, () => handler());
}
