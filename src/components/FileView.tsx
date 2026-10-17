import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../api";
import { useT } from "../i18n";
import { formatBytes, formatModified } from "../lib/format";
import { MountNodeView, SortKey } from "../types";
import { useAppStore } from "../store";
import { MediaThumb } from "./MediaThumb";

export function FileView({
  onContext,
}: {
  onContext: (event: MouseEvent, node: MountNodeView) => void;
}) {
  const t = useT();
  const children = useAppStore((s) => s.children);
  const viewMode = useAppStore((s) => s.viewMode);
  const sort = useAppStore((s) => s.sort);
  const setSort = useAppStore((s) => s.setSort);
  const highlighted = useAppStore((s) => s.highlighted);
  const setHighlighted = useAppStore((s) => s.setHighlighted);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const crumbs = useAppStore((s) => s.crumbs);
  const openFolder = useAppStore((s) => s.openFolder);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const kindFilter = useAppStore((s) => s.kindFilter);
  const setKindFilter = useAppStore((s) => s.setKindFilter);
  const thumbSize = useAppStore((s) => s.thumbSize);
  const setThumbSize = useAppStore((s) => s.setThumbSize);
  const parentRef = useRef<HTMLDivElement>(null);
  const rowHeight = Math.max(44, thumbSize + 16);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.measure();
    // thumb size changes row height; ignore virtualizer identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbSize, rowHeight]);

  const inspect = (node: MountNodeView, additive: boolean) => {
    if (additive) {
      const next = highlighted.includes(node.id)
        ? highlighted.filter((id) => id !== node.id)
        : [...highlighted, node.id];
      setHighlighted(next, node.id);
    } else {
      setHighlighted([node.id], node.id);
    }
  };

  async function togglePlay(node: MountNodeView, selected: boolean) {
    await api.setSelected([node.id], selected);
    await refreshAll();
  }

  async function onDropReorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = children.map((c) => c.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
    await api.reorder(currentFolderId, ids);
    await refreshAll();
  }

  const headerClick = (key: SortKey) => {
    setSort({
      key,
      ascending: sort.key === key ? !sort.ascending : true,
    });
  };

  const crumbTrail = useMemo(() => crumbs, [crumbs]);
  const kindText = (node: MountNodeView) => {
    if (node.is_folder) return t("folder");
    if (node.media_kind === "video") return t("video");
    if (node.media_kind === "image") return t("image");
    return t("file");
  };

  return (
    <section className="main" style={{ ["--thumb-size" as string]: `${thumbSize}px` }}>
      <div className="main-head">
        <button className="btn ghost" onClick={() => void openFolder(null)}>
          {t("library")}
        </button>
        {crumbTrail.map((c) => (
          <span key={c.id}>
            /{" "}
            <button className="btn ghost crumb" onClick={() => void openFolder(c.id)}>
              {c.display_name}
            </button>
          </span>
        ))}
        <div className="filters">
          <label className="thumb-size-ctrl">
            {t("thumbSize")}
            <input
              type="range"
              min={48}
              max={200}
              step={8}
              value={thumbSize}
              onChange={(e) => setThumbSize(Number(e.target.value))}
            />
            <span>{thumbSize}</span>
          </label>
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
            <option value="all">{t("filterAll")}</option>
            <option value="image">{t("filterImage")}</option>
            <option value="video">{t("filterVideo")}</option>
            <option value="folder">{t("filterFolder")}</option>
            <option value="missing">{t("filterMissing")}</option>
            <option value="detected">{t("filterDetected")}</option>
          </select>
        </div>
      </div>
      {children.length === 0 ? (
        <div className="empty">
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
        </div>
      ) : viewMode === "thumb" ? (
        <div className="list" ref={parentRef}>
          <div
            className="thumb-grid"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(140, thumbSize + 52)}px, 1fr))` }}
          >
            {children.map((node) => (
              <article
                key={node.id}
                className={`thumb-card ${highlighted.includes(node.id) ? "active" : ""} ${node.exists ? "" : "missing"}`}
                onClick={(e) => inspect(node, e.metaKey || e.ctrlKey)}
                onDoubleClick={() => node.is_folder && void openFolder(node.id)}
                onContextMenu={(e) => onContext(e, node)}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/omwe-id", node.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDropReorder(e.dataTransfer.getData("text/omwe-id"), node.id);
                }}
              >
                <div className="thumb-preview" style={{ height: thumbSize }}>
                  <MediaThumb
                    path={node.original_path}
                    kind={node.media_kind}
                    isFolder={node.is_folder}
                    exists={node.exists}
                    size={thumbSize}
                  />
                </div>
                <div className="thumb-meta">
                  <input
                    type="checkbox"
                    checked={node.selected}
                    onChange={(e) => void togglePlay(node, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="thumb-name">{node.display_name}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="list">
          <div className="list-head list-head-preview">
            <span />
            <span>{t("colPreview")}</span>
            <button onClick={() => headerClick("name")}>{t("colName")}</button>
            <button onClick={() => headerClick("size")}>{t("colSize")}</button>
            <button onClick={() => headerClick("type")}>{t("colType")}</button>
            <button onClick={() => headerClick("modified")}>{t("colModified")}</button>
          </div>
          <div ref={parentRef} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((row) => {
                const node = children[row.index];
                if (!node) return null;
                return (
                  <div
                    key={node.id}
                    className={`list-row list-row-preview ${highlighted.includes(node.id) ? "active" : ""} ${node.exists ? "" : "missing"}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: rowHeight,
                      transform: `translateY(${row.start}px)`,
                    }}
                    onClick={(e) => inspect(node, e.metaKey || e.ctrlKey)}
                    onDoubleClick={() => node.is_folder && void openFolder(node.id)}
                    onContextMenu={(e) => onContext(e, node)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/omwe-id", node.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void onDropReorder(e.dataTransfer.getData("text/omwe-id"), node.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={node.selected}
                      onChange={(e) => void togglePlay(node, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <MediaThumb
                      path={node.original_path}
                      kind={node.media_kind}
                      isFolder={node.is_folder}
                      exists={node.exists}
                      size={thumbSize}
                    />
                    <div className="name">
                      <span>{node.display_name}</span>
                    </div>
                    <span>{formatBytes(node.size)}</span>
                    <span>
                      {kindText(node)}
                      {node.exists ? "" : ` · ${t("missing")}`}
                    </span>
                    <span>{formatModified(node.modified_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
