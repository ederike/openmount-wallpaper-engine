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

interface Measured {
  item: PlaybackItem;
  src: string;
  width: number;
  height: number;
}

function ScrollStage({ engine, resetToken }: { engine: EngineState; resetToken: number }) {
  const [measured, setMeasured] = useState<Measured[]>([]);
  const offset = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const settings = engine.settings.scroll;

  useEffect(() => {
    let cancelled = false;
    async function measure() {
      const screenH = window.innerHeight;
      const results: Measured[] = [];
      for (const item of engine.pool) {
        const src = convertFileSrc(item.path);
        const size = await naturalSize(item, src);
        const scale = screenH / Math.max(size.h, 1);
        results.push({
          item,
          src,
          width: size.w * scale,
          height: screenH,
        });
      }
      if (!cancelled) {
        setMeasured(results);
        offset.current = 0;
      }
    }
    void measure();
    return () => {
      cancelled = true;
    };
  }, [engine.pool, resetToken]);

  const total = useMemo(
    () => measured.reduce((sum, m) => sum + m.width + settings.gap_px, 0),
    [measured, settings.gap_px],
  );

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (engine.running && !engine.paused && total > 0) {
        const dir = settings.direction === "rtl" ? -1 : 1;
        offset.current += dir * settings.speed_px_per_sec * dt;
        if (settings.loop_enabled) {
          if (offset.current > total) offset.current -= total;
          if (offset.current < 0) offset.current += total;
        }
        setTick((n) => n + 1);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [engine.running, engine.paused, settings.direction, settings.speed_px_per_sec, settings.loop_enabled, total]);

  const screenW = typeof window === "undefined" ? 1920 : window.innerWidth;
  void tick;

  let cursor = 0;
  const placed = measured.map((m) => {
    const base = cursor;
    cursor += m.width + settings.gap_px;
    return { m, base };
  });
  const shifts = settings.loop_enabled ? [0, total] : [0];

  return (
    <div className="wallpaper" style={{ opacity: settings.opacity }}>
      <div className="scroll-stage" ref={stageRef}>
        {placed.flatMap(({ m, base }, index) =>
          shifts.map((shift) => {
            const left = base - offset.current + shift;
            const visible = left + m.width > -screenW && left < screenW * 2;
            const inView = left < screenW && left + m.width > 0;
            if (!visible) return null;
            return (
              <div
                key={`${m.item.node_id}-${index}-${shift}`}
                className="scroll-item"
                style={{ left, width: m.width, height: m.height }}
              >
                {m.item.kind === "video" ? (
                  <ScrollVideo src={m.src} active={inView} preloadLead={settings.preload_seconds} />
                ) : (
                  <img src={m.src} alt="" />
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function ScrollVideo({ src, active, preloadLead }: { src: string; active: boolean; preloadLead: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      const t = window.setTimeout(() => {
        void el.play().catch(() => undefined);
      }, Math.max(0, preloadLead) * 0);
      return () => window.clearTimeout(t);
    }
    el.pause();
    return undefined;
  }, [active, preloadLead]);
  return <video ref={ref} src={src} muted playsInline loop preload="auto" />;
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
