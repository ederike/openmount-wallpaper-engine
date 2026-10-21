import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
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
  src: string;
  natW: number;
  natH: number;
}

interface Measured {
  item: PlaybackItem;
  src: string;
  width: number;
  height: number;
}

const scrollMemory = { poolKey: "", offset: 0 };

function poolKey(pool: PlaybackItem[]): string {
  return pool.map((item) => `${item.node_id}:${item.path}`).join("|");
}

function wrapOffset(value: number, total: number): number {
  if (total <= 0) return 0;
  let next = value % total;
  if (next < 0) next += total;
  return next;
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

function applyOffset(strip: HTMLDivElement | null, value: number) {
  if (strip) strip.style.transform = `translate3d(${-value}px,0,0)`;
}

function layoutFromNaturals(naturals: Natural[], height: number): Measured[] {
  const h = Math.max(height, 1);
  return naturals.map((n) => ({
    item: n.item,
    src: n.src,
    width: Math.max(1, (n.natW / Math.max(n.natH, 1)) * h),
    height: h,
  }));
}

function ScrollStage({ engine, resetToken }: { engine: EngineState; resetToken: number }) {
  const [naturals, setNaturals] = useState<Natural[]>([]);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const offset = useRef(scrollMemory.offset);
  const stripRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef<Measured[]>([]);
  const stageRefSize = useRef(stage);
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
      const results: Natural[] = [];
      for (const item of engine.pool) {
        const src = convertFileSrc(item.path);
        const size = await naturalSize(item, src);
        results.push({
          item,
          src,
          natW: size.w,
          natH: size.h,
        });
      }
      if (!cancelled) {
        setNaturals(results);
        if (scrollMemory.poolKey !== key) {
          scrollMemory.poolKey = key;
          scrollMemory.offset = 0;
          offset.current = 0;
          applyOffset(stripRef.current, 0);
        }
      }
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
    if (prevTotal > 1 && nextTotal > 1 && Math.abs(nextTotal - prevTotal) > 1) {
      offset.current = wrapOffset(offset.current * (nextTotal / prevTotal), nextTotal);
      scrollMemory.offset = offset.current;
    }
    applyOffset(stripRef.current, offset.current);
  }, [measured, settings.gap_px]);

  const copies = settings.loop_enabled ? 2 : 1;
  const total = useMemo(
    () => measured.reduce((sum, m) => sum + m.width + settings.gap_px, 0),
    [measured, settings.gap_px],
  );

  useEffect(() => {
    if (resetToken === 0) return;
    offset.current = 0;
    scrollMemory.offset = 0;
    applyOffset(stripRef.current, 0);
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
      applyOffset(stripRef.current, offset.current);
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
      if (engine.running && !engine.paused && total > 0) {
        const dir = settings.direction === "rtl" ? -1 : 1;
        offset.current += dir * settings.speed_px_per_sec * dt;
        if (settings.loop_enabled) {
          offset.current = wrapOffset(offset.current, total);
        }
        scrollMemory.offset = offset.current;
      }
      applyOffset(stripRef.current, offset.current);
      if (total > 0) {
        let bestId: string | null = null;
        let bestOverlap = 0;
        let x = 0;
        for (const m of measured) {
          if (m.item.kind === "video") {
            const left = x - offset.current;
            const overlap = Math.min(left + m.width, screenW) - Math.max(left, 0);
            if (overlap > bestOverlap) {
              bestOverlap = overlap;
              bestId = m.item.node_id;
            }
          }
          x += m.width + settings.gap_px;
        }
        if (bestOverlap < 8) bestId = null;
        if (bestId !== lastActive) {
          lastActive = bestId;
          setActiveVideo(engine.paused ? null : bestId);
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
    total,
    measured,
  ]);

  return (
    <div className="wallpaper" style={{ opacity: settings.opacity }}>
      <div ref={stageRef} className="scroll-stage">
        <div
          ref={stripRef}
          className="scroll-strip"
          style={{ gap: settings.gap_px, willChange: "transform" }}
        >
          {Array.from({ length: copies }, (_, copy) =>
            measured.map((m) => (
              <div
                key={`${copy}-${m.item.node_id}`}
                className="scroll-item"
                style={{ width: m.width, height: "100%", contentVisibility: "auto" }}
              >
                {m.item.kind === "video" ? (
                  <ScrollVideo
                    src={m.src}
                    active={activeVideo === m.item.node_id && copy === 0 && !engine.paused}
                  />
                ) : (
                  <img src={m.src} alt="" decoding="async" />
                )}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function ScrollVideo({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      if (el.getAttribute("src") !== src) {
        el.src = src;
      }
      void el.play().catch(() => undefined);
      return undefined;
    }
    el.pause();
    el.removeAttribute("src");
    el.load();
    return undefined;
  }, [active, src]);
  return <video ref={ref} muted playsInline loop preload={active ? "auto" : "none"} />;
}

function naturalSize(item: PlaybackItem, src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (item.kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = src;
      video.onloadedmetadata = () =>
        resolve({ w: video.videoWidth || 16, h: video.videoHeight || 9 });
      video.onerror = () => resolve({ w: 16, h: 9 });
    } else {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 });
      img.onerror = () => resolve({ w: 16, h: 9 });
      img.src = src;
    }
  });
}
