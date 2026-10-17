import { useMemo, useRef, type MouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../api";
import { formatBytes, formatModified, kindLabel } from "../lib/format";
import { MountNodeView, SortKey } from "../types";
import { useAppStore } from "../store";
import { Icon } from "./Icon";

export function FileView({
  onContext,
}: {
  onContext: (event: MouseEvent, node: MountNodeView) => void;
}) {
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
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

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

  return (
    <section className="main">
      <div className="main-head">
        <button className="btn ghost" onClick={() => void openFolder(null)}>Library</button>
        {crumbTrail.map((c) => (
          <span key={c.id}>
            / <button className="btn ghost crumb" onClick={() => void openFolder(c.id)}>{c.display_name}</button>
          </span>
        ))}
        <div className="filters">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
            <option value="all">All</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="folder">Folders</option>
            <option value="missing">Missing</option>
            <option value="detected">Detection on</option>
          </select>
        </div>
      </div>
      {children.length === 0 ? (
        <div className="empty">
          <h2>Nothing mounted here</h2>
          <p>Mount a folder or media file. OMWE only records a mapping — original files stay where they are.</p>
        </div>
      ) : viewMode === "thumb" ? (
        <div className="list" ref={parentRef}>
          <div className="thumb-grid">
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
                <div className="thumb-preview">
                  {node.is_folder ? (
                    <Icon name="folder" className="icon lg" />
                  ) : node.exists && node.media_kind === "image" ? (
                    <img src={convertFileSrc(node.original_path)} alt="" />
                  ) : node.exists && node.media_kind === "video" ? (
                    <video src={convertFileSrc(node.original_path)} muted />
                  ) : (
                    node.media_kind ?? "missing"
                  )}
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
          <div className="list-head">
            <span />
            <span />
            <button onClick={() => headerClick("name")}>Name</button>
            <button onClick={() => headerClick("size")}>Size</button>
            <button onClick={() => headerClick("type")}>Type</button>
            <button onClick={() => headerClick("modified")}>Modified</button>
          </div>
          <div ref={parentRef} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((row) => {
              const node = children[row.index];
              if (!node) return null;
              return (
                <div
                  key={node.id}
                  className={`list-row ${highlighted.includes(node.id) ? "active" : ""} ${node.exists ? "" : "missing"}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
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
                  <span>{node.is_folder ? <Icon name="folder" /> : node.media_kind === "video" ? <Icon name="video" /> : <Icon name="image" />}</span>
                  <div className="name">
                    <span>{node.display_name}</span>
                  </div>
                  <span>{formatBytes(node.size)}</span>
                  <span>{kindLabel(node)}</span>
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
