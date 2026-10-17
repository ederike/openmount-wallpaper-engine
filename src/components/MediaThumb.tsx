import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "./Icon";

export function MediaThumb({
  path,
  kind,
  isFolder,
  exists,
  size,
}: {
  path: string;
  kind: string | null;
  isFolder: boolean;
  exists: boolean;
  size: number;
}) {
  if (isFolder) {
    return (
      <div className="media-thumb folder" style={{ width: size, height: size }}>
        <Icon name="folder" className="icon lg" />
      </div>
    );
  }
  if (!exists) {
    return (
      <div className="media-thumb missing" style={{ width: size, height: size }}>
        <Icon name={kind === "video" ? "video" : "image"} />
      </div>
    );
  }
  const src = convertFileSrc(path);
  return (
    <div className="media-thumb" style={{ width: size, height: size }}>
      {kind === "video" ? (
        <video src={src} muted playsInline preload="metadata" />
      ) : (
        <img src={src} alt="" loading="lazy" decoding="async" />
      )}
    </div>
  );
}
