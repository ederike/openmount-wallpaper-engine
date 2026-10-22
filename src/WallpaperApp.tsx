import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BitmapCache,
  buildLayout,
  distToView,
  loadLimit,
  mapPool,
  pickWarmVideos,
  placeItems,
  probeNaturalSize,
  wrapOffset,
  type PlacedMedia,
  type SizedMedia,
} from "./lib/scrollMedia";
import { EngineState, FillMode, PlaybackItem } from "./types";
import "./styles/wallpaper.css";

function fitClass(mode: FillMode): string {
  return mode;
}

export default function WallpaperApp() {
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    void invoke<EngineState>("get_engine").then(setEngine);
    const unlistenState = listen<EngineState>("engine://state", (e) => setEngine(e.payload));
    const unlistenReset = listen("engine://reset-scroll", () => setResetToken((n) => n + 1));
    return () => {
      void unlistenState.then((u) => u());
      void unlistenReset.then((u) => u());
    };
  }, []);

  if (!engine || engine.pool.length === 0) {
    return <div className="wallpaper empty-wall">OpenMount</div>;
  }

  if (engine.mode === "scroll") {
    return <ScrollStage engine={engine} resetToken={resetToken} />;
  }
  return <TraditionalStage engine={engine} />;
}

function TraditionalStage({ engine }: { engine: EngineState }) {
  const item = engine.pool[engine.current_index];
  const prevIndex = engine.pool.length ? (engine.current_index + engine.pool.length - 1) % engine.pool.length : 0;
  const prev = engine.pool[prevIndex];
  const fade = engine.settings.traditional.fade_enabled;
  const fadeMs = engine.settings.traditional.fade_ms;
  const fill = engine.settings.traditional.fill_mode;
  const bg = engine.settings.traditional.background_color;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!item || engine.paused || !engine.running) return;
    if (item.kind === "image") {
      timer.current = window.setTimeout(() => {
        void invoke("next_item");
      }, engine.settings.traditional.image_dwell_ms);
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [item, engine.paused, engine.running, engine.settings.traditional.image_dwell_ms, engine.current_index]);

  if (!item) return <div className="wallpaper" style={{ background: bg }} />;

  return (
    <div className="wallpaper" style={{ background: bg }}>
      {prev && prev.node_id !== item.node_id && (
        <MediaLayer item={prev} fill={fill} show={!fade} fadeMs={fadeMs} />
      )}
      <MediaLayer
        key={item.node_id + engine.current_index}
        item={item}
        fill={fill}
        show
        fadeMs={fade ? fadeMs : 0}
        loopVideo={engine.settings.traditional.video_end_action === "loop"}
        onVideoEnded={() => {
          if (!engine.paused) void invoke("next_item");
        }}
      />
    </div>
  );
}

function MediaLayer({
  item,
  fill,
  show,
  fadeMs,
  loopVideo,
  onVideoEnded,
}: {
  item: PlaybackItem;
  fill: FillMode;
  show: boolean;
  fadeMs: number;
  loopVideo?: boolean;
  onVideoEnded?: () => void;
}) {
  const src = convertFileSrc(item.path);
  const tile = fill === "tile" && item.kind === "image";
  return (
    <div
      className={`layer ${fitClass(fill)} ${show ? "show" : ""}`}
      style={{
        transitionDuration: `${fadeMs}ms`,
        backgroundImage: tile ? `url("${src}")` : undefined,
      }}
    >
      {tile ? null : item.kind === "video" ? (
        <video
          src={src}
          autoPlay
          muted
          loop={loopVideo}
          playsInline
          onEnded={() => {
            if (!loopVideo) onVideoEnded?.();
          }}
        />
      ) : (
        <img src={src} alt="" />
      )}
    </div>
  );
}

interface Natural {
  item: PlaybackItem;
  natW: number;
  natH: number;
}

interface Measured {
  item: PlaybackItem;
  width: number;
  height: number;
}

interface PoolSize {
  node_id: string;
  width: number;
  height: number;
}

const scrollMemory = { poolKey: "", offset: 0 };

function poolKey(pool: PlaybackItem[]): string {
  return pool.map((item) => `${item.node_id}:${item.path}`).join("|");
}

function itemDocks(measured: Measured[], gap: number, screenW: number, leadingRight: boolean): number[] {
  const docks: number[] = [];
  let base = 0;
  for (const item of measured) {
    docks.push(leadingRight ? base + item.width - screenW : base);
    base += item.width + gap;
  }
  return docks;
}

function snapDock(
  current: number,
  docks: number[],
  total: number,
  forward: boolean,
  loop: boolean,
): number {
  if (docks.length === 0) return current;
  const eps = 6;
  const ordered = docks.map((d) => wrapOffset(d, Math.max(total, 1)));
  if (forward) {
    const next = ordered.filter((d) => d > current + eps).sort((a, b) => a - b)[0];
    if (next != null) return next;
    return loop ? ordered.reduce((min, d) => Math.min(min, d), ordered[0] ?? 0) : current;
  }
  const prev = ordered.filter((d) => d < current - eps).sort((a, b) => b - a)[0];
  if (prev != null) return prev;
  return loop ? ordered.reduce((max, d) => Math.max(max, d), ordered[0] ?? 0) : current;
}

function layoutFromNaturals(naturals: Natural[], height: number): Measured[] {
  const h = Math.max(height, 1);
  return naturals.map((n) => ({
    item: n.item,
    width: Math.max(1, (n.natW / Math.max(n.natH, 1)) * h),
    height: h,
  }));
}

function toSized(measured: Measured[]): SizedMedia[] {
  return measured.map((m) => ({
    path: m.item.path,
    nodeId: m.item.node_id,
    kind: String(m.item.kind),
    width: m.width,
    height: m.height,
  }));
}

function preloadPad(preloadSeconds: number, speed: number, screenW: number): number {
  const requested = Math.max(0, preloadSeconds) * Math.max(0, speed);
  return Math.min(Math.max(screenW, 1) * 4, requested);
}

function imagePad(preloadSeconds: number, speed: number, screenW: number): number {
  const videoPad = preloadPad(preloadSeconds, speed, screenW);
  const minLookahead = Math.max(speed * 1.5, 240);
  return Math.min(Math.max(screenW, 1) * 4, Math.max(videoPad, minLookahead));
}

function slotsKey(items: PlacedMedia[]): string {
  return items.map((item) => item.slot).join("|");
}

function ScrollStage({ engine, resetToken }: { engine: EngineState; resetToken: number }) {
  const [naturals, setNaturals] = useState<Natural[]>([]);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [warmVideos, setWarmVideos] = useState<PlacedMedia[]>([]);
  const offset = useRef(scrollMemory.offset);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videosRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<BitmapCache | null>(null);
  const measuredRef = useRef<Measured[]>([]);
  const sizedRef = useRef<SizedMedia[]>([]);
  const prefixRef = useRef<number[]>([]);
  const stageRefSize = useRef(stage);
  const warmKeyRef = useRef("");
  const warmedBitmaps = useRef(new Set<string>());
  const warmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const settings = engine.settings.scroll;
  const key = poolKey(engine.pool);
  stageRefSize.current = stage;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setStage((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    visualViewport?.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      visualViewport?.removeEventListener("resize", apply);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let sizes: PoolSize[] = [];
      try {
        sizes = await invoke<PoolSize[]>("probe_pool_sizes");
      } catch {
        sizes = [];
      }
      if (cancelled) return;
      const byId = new Map(sizes.map((size) => [size.node_id, size]));
      const results: Natural[] = engine.pool.map((item) => {
        const size = byId.get(item.node_id);
        const hasSize = size && size.width > 0 && size.height > 0;
        return {
          item,
          natW: hasSize ? size.width : 16,
          natH: hasSize ? size.height : 9,
        };
      });
      setNaturals(results);
      if (scrollMemory.poolKey !== key) {
        scrollMemory.poolKey = key;
        scrollMemory.offset = 0;
        offset.current = 0;
      }
      const videos = engine.pool.filter((item) => item.kind === "video");
      if (videos.length === 0) return;
      const updates = await mapPool(videos, loadLimit(), async (item) => {
        const size = await probeNaturalSize("video", convertFileSrc(item.path));
        return { id: item.node_id, w: size.w, h: size.h };
      });
      if (cancelled) return;
      const videoSizes = new Map(updates.map((row) => [row.id, row]));
      setNaturals((prev) =>
        prev.map((entry) => {
          const next = videoSizes.get(entry.item.node_id);
          return next ? { ...entry, natW: next.w, natH: next.h } : entry;
        }),
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Reload media metrics when the pool identity changes, not on pause/resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resetToken]);

  const measured = useMemo(
    () => (stage.h >= 8 ? layoutFromNaturals(naturals, stage.h) : []),
    [naturals, stage.h],
  );

  useEffect(() => {
    const prevTotal = measuredRef.current.reduce((sum, m) => sum + m.width + settings.gap_px, 0);
    const nextTotal = measured.reduce((sum, m) => sum + m.width + settings.gap_px, 0);
    measuredRef.current = measured;
    sizedRef.current = toSized(measured);
    prefixRef.current = buildLayout(sizedRef.current, settings.gap_px).prefix;
    if (prevTotal > 1 && nextTotal > 1 && Math.abs(nextTotal - prevTotal) > 1) {
      offset.current = wrapOffset(offset.current * (nextTotal / prevTotal), nextTotal);
      scrollMemory.offset = offset.current;
    }
  }, [measured, settings.gap_px]);

  const total = useMemo(
    () => measured.reduce((sum, m) => sum + m.width + settings.gap_px, 0),
    [measured, settings.gap_px],
  );

  useEffect(() => {
    const cache = new BitmapCache();
    cacheRef.current = cache;
    warmedBitmaps.current = new Set();
    if (!warmCanvasRef.current) warmCanvasRef.current = document.createElement("canvas");
    return () => {
      cache.dispose();
      if (cacheRef.current === cache) cacheRef.current = null;
    };
  }, [key, stage.h]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage.w < 1 || stage.h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(stage.w * dpr));
    canvas.height = Math.max(1, Math.round(stage.h * dpr));
  }, [stage.w, stage.h]);

  useEffect(() => {
    if (resetToken === 0) return;
    offset.current = 0;
    scrollMemory.offset = 0;
  }, [resetToken]);

  useEffect(() => {
    const unlisten = listen<{ forward: boolean }>("engine://scroll-skip", (event) => {
      const items = measuredRef.current;
      const length = items.reduce((sum, item) => sum + item.width + settings.gap_px, 0);
      if (length <= 0) return;
      const leadingRight = settings.direction !== "rtl";
      const docks = itemDocks(items, settings.gap_px, stageRefSize.current.w || window.innerWidth, leadingRight);
      const forward = leadingRight ? event.payload.forward : !event.payload.forward;
      offset.current = snapDock(
        offset.current,
        docks,
        length,
        forward,
        settings.loop_enabled,
      );
      scrollMemory.offset = offset.current;
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, [settings.direction, settings.gap_px, settings.loop_enabled]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastActive: string | null = null;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const screenW = stageRefSize.current.w || window.innerWidth;
      const screenH = stageRefSize.current.h || window.innerHeight;
      if (engine.running && !engine.paused && total > 0) {
        const dir = settings.direction === "rtl" ? -1 : 1;
        offset.current += dir * settings.speed_px_per_sec * dt;
        if (settings.loop_enabled) {
          offset.current = wrapOffset(offset.current, total);
        }
        scrollMemory.offset = offset.current;
      }

      const sized = sizedRef.current;
      const prefix = prefixRef.current;
      const padImages = imagePad(settings.preload_seconds, settings.speed_px_per_sec, screenW);
      const padVideos = preloadPad(settings.preload_seconds, settings.speed_px_per_sec, screenW);
      const nearby = placeItems(sized, prefix, offset.current, screenW, padImages, total, settings.loop_enabled);
      const visible = placeItems(sized, prefix, offset.current, screenW, 1, total, settings.loop_enabled);
      const videoWindow = placeItems(
        sized,
        prefix,
        offset.current,
        screenW,
        padVideos,
        total,
        settings.loop_enabled,
      );

      const wanted = nearby
        .filter((item) => item.kind !== "video")
        .map((item) => ({
          src: convertFileSrc(item.path),
          width: item.width,
          height: item.height,
          dist: distToView(item.x, item.width, offset.current, screenW),
        }));
      cacheRef.current?.sync(wanted);

      const canvas = canvasRef.current;
      const cache = cacheRef.current;
      if (canvas && screenW > 0 && screenH > 0) {
        const ctx =
          canvas.getContext("2d", { alpha: false, desynchronized: true }) ??
          canvas.getContext("2d", { alpha: false }) ??
          canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const sx = canvas.width / screenW;
          const sy = canvas.height / screenH;
          const warmCtx = warmCanvasRef.current?.getContext("2d", { alpha: false });
          for (const item of nearby) {
            if (item.kind === "video") continue;
            const bitmap = cache?.get(convertFileSrc(item.path), item.width, item.height);
            if (!bitmap) continue;
            const bmpKey = `${item.path}|${Math.round(item.width)}x${Math.round(item.height)}`;
            if (!warmedBitmaps.current.has(bmpKey)) {
              if (warmCtx && warmCanvasRef.current) {
                const warm = warmCanvasRef.current;
                if (warm.width !== 64 || warm.height !== 64) {
                  warm.width = 64;
                  warm.height = 64;
                }
                warmCtx.drawImage(bitmap, 0, 0, 64, 64);
              }
              warmedBitmaps.current.add(bmpKey);
            }
            const dx = (item.x - offset.current) * sx;
            const dw = item.width * sx;
            if (dx + dw <= 0 || dx >= canvas.width) continue;
            ctx.drawImage(bitmap, dx, 0, dw, item.height * sy);
          }
        }
      }

      const nextWarm = pickWarmVideos(videoWindow, offset.current, screenW);
      const nextWarmKey = slotsKey(nextWarm);
      if (nextWarmKey !== warmKeyRef.current) {
        warmKeyRef.current = nextWarmKey;
        setWarmVideos(nextWarm);
      }

      const videoRoot = videosRef.current;
      if (videoRoot) {
        for (const child of Array.from(videoRoot.children)) {
          if (!(child instanceof HTMLElement)) continue;
          const slot = child.dataset.slot;
          const placed = nextWarm.find((item) => item.slot === slot) ?? videoWindow.find((item) => item.slot === slot);
          if (placed) {
            child.style.transform = `translate3d(${placed.x - offset.current}px,0,0)`;
            child.style.width = `${placed.width}px`;
          }
        }
      }

      let bestId: string | null = null;
      let bestOverlap = 0;
      for (const item of visible) {
        if (item.kind !== "video") continue;
        const left = item.x - offset.current;
        const overlap = Math.min(left + item.width, screenW) - Math.max(left, 0);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestId = item.nodeId;
        }
      }
      if (bestOverlap < 8) bestId = null;
      if (bestId !== lastActive || engine.paused) {
        lastActive = engine.paused ? null : bestId;
      }
      if (videoRoot) {
        for (const child of Array.from(videoRoot.children)) {
          if (!(child instanceof HTMLVideoElement)) continue;
          const shouldPlay = !engine.paused && engine.running && child.dataset.id === lastActive;
          if (shouldPlay) {
            if (child.paused) void child.play().catch(() => undefined);
          } else if (!child.paused) {
            child.pause();
          }
        }
      }

      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [
    engine.running,
    engine.paused,
    settings.direction,
    settings.speed_px_per_sec,
    settings.loop_enabled,
    settings.gap_px,
    settings.preload_seconds,
    total,
    measured,
  ]);

  return (
    <div className="wallpaper" style={{ opacity: settings.opacity }}>
      <div ref={stageRef} className="scroll-stage">
        <canvas ref={canvasRef} className="scroll-canvas" />
        <div ref={videosRef} className="scroll-videos">
          {warmVideos.map((item) => (
            <WarmVideo key={item.slot} item={item} translateX={item.x - offset.current} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WarmVideo({ item, translateX }: { item: PlacedMedia; translateX: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const src = convertFileSrc(item.path);
    if (el.getAttribute("src") !== src) {
      el.src = src;
    }
    el.preload = "auto";
    return () => {
      el.pause();
      el.removeAttribute("src");
      try {
        el.load();
      } catch {
        /* ignore */
      }
    };
  }, [item.path]);
  return (
    <video
      ref={ref}
      data-slot={item.slot}
      data-id={item.nodeId}
      muted
      playsInline
      loop
      preload="auto"
      style={{ width: item.width, transform: `translate3d(${translateX}px,0,0)` }}
    />
  );
}
