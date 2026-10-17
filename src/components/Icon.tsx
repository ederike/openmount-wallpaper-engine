type IconName =
  | "mount"
  | "refresh"
  | "play"
  | "pause"
  | "stop"
  | "next"
  | "prev"
  | "settings"
  | "search"
  | "list"
  | "grid"
  | "folder"
  | "image"
  | "video"
  | "more";

const paths: Record<IconName, string> = {
  mount:
    "M4 20h16M7 16V8l5-5 5 5v8M9 16h6",
  refresh:
    "M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12.2 3M19 9A7 7 0 0 0 6.8 6",
  play: "M8 5v14l11-7z",
  pause: "M7 5h3v14H7zM14 5h3v14h-3z",
  stop: "M6 6h12v12H6z",
  next: "M6 6l8 6-8 6V6zM18 6v12",
  prev: "M18 6l-8 6 8 6V6zM6 6v12",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.4 4a7.8 7.8 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.1-1.2L15.4 2h-4.8L10.2 4.6A8 8 0 0 0 8 5.8l-2.4-1-2 3.5 2 1.5A8 8 0 0 0 5.5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1c.6.5 1.3.9 2.1 1.2L10.6 22h4.8l.4-2.6c.8-.3 1.5-.7 2.1-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm10 2-4.3-4.3",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  folder: "M3 7h6l2 2h10v10H3z",
  image: "M4 5h16v14H4zM8 11l3 3 2-2 5 5",
  video: "M4 6h12v12H4zM16 10l4-2v8l-4-2z",
  more: "M12 6h.01M12 12h.01M12 18h.01",
};

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}
