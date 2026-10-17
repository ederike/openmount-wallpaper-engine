import { create } from "zustand";
import { api } from "./api";
import {
  EngineState,
  KindFilter,
  MountNode,
  MountNodeView,
  PlaybackSettings,
  ShortcutBinding,
  SortSpec,
  ViewMode,
} from "./types";

interface AppStore {
  tree: MountNode[];
  children: MountNodeView[];
  currentFolderId: string | null;
  crumbs: MountNode[];
  viewMode: ViewMode;
  sort: SortSpec;
  query: string;
  kindFilter: KindFilter;
  selectedOnly: boolean;
  highlighted: string[];
  inspectId: string | null;
  engine: EngineState | null;
  shortcuts: ShortcutBinding[];
  settingsOpen: boolean;
  confirm: { ids: string[]; deleteOriginal: boolean } | null;
  toast: string | null;
  loading: boolean;
  error: string | null;
  setViewMode: (mode: ViewMode) => void;
  setSort: (sort: SortSpec) => void;
  setQuery: (query: string) => void;
  setKindFilter: (filter: KindFilter) => void;
  setHighlighted: (ids: string[], inspect?: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setConfirm: (confirm: AppStore["confirm"]) => void;
  setToast: (toast: string | null) => void;
  refreshAll: () => Promise<void>;
  openFolder: (id: string | null) => Promise<void>;
  togglePlaySelected: (ids: string[], selected: boolean) => Promise<void>;
  applyEngine: (engine: EngineState) => void;
}

const defaultEngine = (): EngineState => ({
  running: false,
  paused: false,
  mode: "traditional",
  pool: [],
  current_index: 0,
  settings: {
    mode: "traditional",
    traditional: {
      order: "custom",
      avoid_consecutive_repeat: true,
      image_dwell_ms: 8000,
      video_end_action: "next",
      fade_enabled: true,
      fade_ms: 600,
      fill_mode: "cover",
      background_color: "#0e1116",
    },
    scroll: {
      direction: "ltr",
      speed_preset: 4,
      speed_px_per_sec: 40,
      gap_px: 2,
      opacity: 1,
      loop_enabled: true,
      preload_seconds: 2,
    },
  },
});

export const useAppStore = create<AppStore>((set, get) => ({
  tree: [],
  children: [],
  currentFolderId: null,
  crumbs: [],
  viewMode: "list",
  sort: { key: "custom", ascending: true },
  query: "",
  kindFilter: "all",
  selectedOnly: false,
  highlighted: [],
  inspectId: null,
  engine: defaultEngine(),
  shortcuts: [],
  settingsOpen: false,
  confirm: null,
  toast: null,
  loading: false,
  error: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setSort: (sort) => {
    set({ sort });
    void get().openFolder(get().currentFolderId);
  },
  setQuery: (query) => set({ query }),
  setKindFilter: (kindFilter) => {
    set({ kindFilter });
    void get().openFolder(get().currentFolderId);
  },
  setHighlighted: (highlighted, inspect) =>
    set({ highlighted, inspectId: inspect === undefined ? highlighted[0] ?? null : inspect }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setConfirm: (confirm) => set({ confirm }),
  setToast: (toast) => set({ toast }),
  applyEngine: (engine) => set({ engine }),
  refreshAll: async () => {
    set({ loading: true, error: null });
    try {
      const [tree, engine, shortcuts] = await Promise.all([
        api.getTree(),
        api.getEngine(),
        api.getShortcuts(),
      ]);
      set({ tree, engine, shortcuts });
      await get().openFolder(get().currentFolderId);
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },
  openFolder: async (id) => {
    const { sort, query, selectedOnly, kindFilter, tree } = get();
    const children = await api.listChildren({
      parentId: id,
      sort,
      query: query || undefined,
      selectedOnly,
      kindFilter: kindFilter === "all" ? null : kindFilter,
    });
    const crumbs: MountNode[] = [];
    if (id) {
      const byId = new Map(tree.map((n) => [n.id, n]));
      // tree only has folders; also search children for current
      let cursor: string | null = id;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        const node: MountNode | undefined =
          byId.get(cursor) ?? children.find((c) => c.id === cursor);
        if (!node) break;
        crumbs.unshift(node);
        cursor = node.parent_id;
      }
    }
    set({ currentFolderId: id, children, crumbs });
  },
  togglePlaySelected: async (ids, selected) => {
    await api.setSelected(ids, selected);
    await get().refreshAll();
  },
}));

export async function savePlayback(settings: PlaybackSettings) {
  const engine = await api.setPlayback(settings);
  useAppStore.getState().applyEngine(engine);
}
