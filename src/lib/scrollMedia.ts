/** Scroll-mode media helpers.
 *
 * macOS WKWebView (Tauri asset protocol) only allows a handful of concurrent
 * custom-scheme loads. Firing every <img> at once stalls the compositor while
 * each new file decodes, and extra requests fail. Decode off-thread, keep at
 * most two loads in flight, and only keep nearby bitmaps.
 */

export const MAX_DECODED_BITMAPS = 12;
export const MAX_WARM_VIDEOS = 2;

export function isMacWebKit(): boolean {
  return /Mac/i.test(navigator.userAgent) && /AppleWebKit/i.test(navigator.userAgent);
}

export function loadLimit(): number {
  return isMacWebKit() ? 2 : 3;
}

export function wrapOffset(value: number, total: number): number {
  if (total <= 0) return 0;
  let next = value % total;
  if (next < 0) next += total;
  return next;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      out[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface SizedMedia {
  path: string;
  nodeId: string;
  kind: string;
  width: number;
  height: number;
}

export interface PlacedMedia extends SizedMedia {
  x: number;
  slot: string;
}

export function distToView(x: number, width: number, offset: number, screenW: number): number {
  const left = x - offset;
  const right = left + width;
  if (right > 0 && left < screenW) return 0;
  if (right <= 0) return -right;
  return left - screenW;
}

export function pickWarmVideos(placed: PlacedMedia[], offset: number, screenW: number): PlacedMedia[] {
  const ranked = placed
    .filter((item) => item.kind === "video")
    .sort((a, b) => distToView(a.x, a.width, offset, screenW) - distToView(b.x, b.width, offset, screenW));
  const out: PlacedMedia[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    if (seen.has(item.nodeId)) continue;
    seen.add(item.nodeId);
    out.push(item);
    if (out.length >= MAX_WARM_VIDEOS) break;
  }
  return out;
}

export function buildLayout(items: SizedMedia[], gap: number): { prefix: number[]; total: number } {
  const prefix = new Array<number>(items.length);
  let x = 0;
  for (let i = 0; i < items.length; i++) {
    prefix[i] = x;
    x += (items[i]?.width ?? 0) + gap;
  }
  return { prefix, total: x };
}

function firstOverlapping(items: SizedMedia[], prefix: number[], left: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const x = prefix[mid] ?? 0;
    const width = items[mid]?.width ?? 0;
    if (x + width <= left) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function firstAfter(prefix: number[], right: number, length: number): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const x = prefix[mid] ?? 0;
    if (x < right) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function placeItems(
  items: SizedMedia[],
  prefix: number[],
  offset: number,
  screenW: number,
  pad: number,
  total: number,
  loop: boolean,
): PlacedMedia[] {
  if (items.length === 0 || prefix.length !== items.length || total <= 0 || screenW <= 0) return [];
  const viewL = offset - pad;
  const viewR = offset + screenW + pad;
  const shifts = loop ? [-total, 0, total] : [0];
  const out: PlacedMedia[] = [];
  for (const shift of shifts) {
    const left = viewL - shift;
    const right = viewR - shift;
    const start = firstOverlapping(items, prefix, left);
    const end = firstAfter(prefix, right, items.length);
    for (let i = start; i < end; i++) {
      const item = items[i];
      const x0 = prefix[i];
      if (!item || x0 === undefined) continue;
      if (x0 + item.width > left && x0 < right) {
        out.push({ ...item, x: x0 + shift, slot: `${shift}:${item.nodeId}` });
      }
    }
  }
  return out;
}

export function cacheKey(src: string, width: number, height: number): string {
  return `${src}|${Math.round(width)}x${Math.round(height)}`;
}

function closeSource(value: CanvasImageSource) {
  if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) {
    value.close();
  }
}

function backingSize(width: number, height: number): { w: number; h: number } {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.max(1, Math.round(width * scale));
  let h = Math.max(1, Math.round(height * scale));
  const maxSide = 4096;
  const biggest = Math.max(w, h);
  if (biggest > maxSide) {
    const s = maxSide / biggest;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { w, h };
}

function loadHtmlImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (error) {
        img.src = "";
        reject(error);
      } else {
        resolve(img);
      }
    };
    const timer = window.setTimeout(() => finish(new Error("image timeout")), timeoutMs);
    img.onload = () => finish();
    img.onerror = () => finish(new Error("image error"));
    img.src = src;
  });
}

async function decodeImageOnce(src: string, width: number, height: number): Promise<CanvasImageSource> {
  const img = await loadHtmlImage(src, 12000);
  try {
    await img.decode();
  } catch {
    /* already loaded */
  }
  const size = backingSize(width, height);
  try {
    const bitmap = await createImageBitmap(img, {
      resizeWidth: size.w,
      resizeHeight: size.h,
      resizeQuality: "high",
    });
    img.src = "";
    return bitmap;
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      img.src = "";
      throw new Error("2d context");
    }
    ctx.drawImage(img, 0, 0, size.w, size.h);
    img.src = "";
    return canvas;
  }
}

async function decodeImage(src: string, width: number, height: number): Promise<CanvasImageSource> {
  let last: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await decodeImageOnce(src, width, height);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      await sleep(200 * 2 ** attempt);
    }
  }
  throw last ?? new Error("decode failed");
}

export class BitmapCache {
  private cache = new Map<string, CanvasImageSource>();
  private inflight = new Set<string>();
  private failedAt = new Map<string, number>();
  private pending: { key: string; src: string; width: number; height: number; dist: number }[] = [];
  private active = 0;
  private gen = 0;
  private disposed = false;

  constructor(
    private readonly maxInflight = loadLimit(),
    private readonly maxEntries = MAX_DECODED_BITMAPS,
  ) {}

  get(src: string, width: number, height: number): CanvasImageSource | null {
    return this.cache.get(cacheKey(src, width, height)) ?? null;
  }

  clear() {
    this.gen += 1;
    this.pending = [];
    this.inflight.clear();
    this.failedAt.clear();
    for (const value of this.cache.values()) closeSource(value);
    this.cache.clear();
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }

  sync(items: { src: string; width: number; height: number; dist: number }[]) {
    if (this.disposed) return;
    const wanted = [...items].sort((a, b) => a.dist - b.dist).slice(0, this.maxEntries);
    const wantedKeys = new Set(wanted.map((item) => cacheKey(item.src, item.width, item.height)));

    for (const [key, value] of [...this.cache]) {
      if (!wantedKeys.has(key)) {
        closeSource(value);
        this.cache.delete(key);
      }
    }

    this.pending = this.pending.filter(
      (job) => wantedKeys.has(job.key) && !this.cache.has(job.key) && !this.inflight.has(job.key),
    );

    for (const item of wanted) {
      const key = cacheKey(item.src, item.width, item.height);
      if (this.cache.has(key) || this.inflight.has(key)) continue;
      const failed = this.failedAt.get(key);
      if (failed !== undefined && performance.now() - failed < 2000) continue;
      const existing = this.pending.find((job) => job.key === key);
      if (existing) {
        existing.dist = item.dist;
      } else {
        this.pending.push({
          key,
          src: item.src,
          width: item.width,
          height: item.height,
          dist: item.dist,
        });
      }
    }
    this.pending.sort((a, b) => a.dist - b.dist);
    this.pump();
  }

  private pump() {
    while (this.active < this.maxInflight && this.pending.length && !this.disposed) {
      const job = this.pending.shift();
      if (!job) break;
      if (this.cache.has(job.key) || this.inflight.has(job.key)) continue;
      this.inflight.add(job.key);
      this.active += 1;
      const gen = this.gen;
      void decodeImage(job.src, job.width, job.height)
        .then((value) => {
          if (this.disposed || gen !== this.gen) {
            closeSource(value);
            return;
          }
          const prev = this.cache.get(job.key);
          if (prev && prev !== value) closeSource(prev);
          this.cache.set(job.key, value);
          this.failedAt.delete(job.key);
        })
        .catch(() => {
          if (!this.disposed && gen === this.gen) this.failedAt.set(job.key, performance.now());
        })
        .finally(() => {
          this.active -= 1;
          this.inflight.delete(job.key);
          if (!this.disposed && gen === this.gen) this.pump();
        });
    }
  }
}

function probeImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("image timeout"));
    }, 12000);
    const cleanup = () => {
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
    img.onload = () => {
      const w = img.naturalWidth || 16;
      const h = img.naturalHeight || 9;
      cleanup();
      resolve({ w, h });
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("image error"));
    };
    img.src = src;
  });
}

function probeVideo(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("video timeout"));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
    video.onloadedmetadata = () => {
      const w = video.videoWidth || 16;
      const h = video.videoHeight || 9;
      cleanup();
      resolve({ w, h });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("video error"));
    };
    video.src = src;
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let last: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      await sleep(200 * 2 ** i);
    }
  }
  throw last ?? new Error("retry failed");
}

export async function probeNaturalSize(
  kind: string,
  src: string,
): Promise<{ w: number; h: number }> {
  try {
    if (kind === "video") return await withRetry(() => probeVideo(src), 3);
    return await withRetry(() => probeImage(src), 3);
  } catch {
    return { w: 16, h: 9 };
  }
}
