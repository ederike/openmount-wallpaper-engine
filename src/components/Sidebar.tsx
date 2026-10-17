import { useT } from "../i18n";
import { MountNode } from "../types";
import { useAppStore } from "../store";
import { api } from "../api";

function TreeRows({
  nodes,
  parentId,
  depth,
}: {
  nodes: MountNode[];
  parentId: string | null;
  depth: number;
}) {
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const openFolder = useAppStore((s) => s.openFolder);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const children = nodes.filter((n) => n.parent_id === parentId);

  return (
    <>
      {children.map((node) => (
        <div key={node.id}>
          <div
            className={`tree-item ${currentFolderId === node.id ? "active" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => void openFolder(node.id)}
          >
            <input
              type="checkbox"
              checked={node.selected}
              onChange={(e) => {
                e.stopPropagation();
                void api.setSelected([node.id], e.target.checked).then(() => refreshAll());
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="tree-label" title={node.original_path}>
              {node.display_name}
            </span>
          </div>
          <TreeRows nodes={nodes} parentId={node.id} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

export function Sidebar() {
  const t = useT();
  const tree = useAppStore((s) => s.tree);
  const currentFolderId = useAppStore((s) => s.currentFolderId);
  const openFolder = useAppStore((s) => s.openFolder);

  return (
    <aside className="sidebar">
      <div className="pane-title">{t("mountTree")}</div>
      <div className="tree">
        <div
          className={`tree-item ${currentFolderId === null ? "active" : ""}`}
          onClick={() => void openFolder(null)}
        >
          <span className="tree-label">{t("libraryRoot")}</span>
        </div>
        <TreeRows nodes={tree} parentId={null} depth={0} />
      </div>
    </aside>
  );
}
