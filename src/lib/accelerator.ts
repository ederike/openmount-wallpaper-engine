const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

const CODE_TO_TOKEN: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: "Comma",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  CapsLock: "CapsLock",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  NumpadAdd: "NumpadAdd",
  NumpadSubtract: "NumpadSubtract",
  NumpadMultiply: "NumpadMultiply",
  NumpadDivide: "NumpadDivide",
  NumpadDecimal: "NumpadDecimal",
  NumpadEnter: "NumpadEnter",
  NumpadEqual: "NumpadEqual",
};

export type KeyCombo = {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

function keyToken(combo: KeyCombo): string | null {
  const { code, key } = combo;
  if (MODIFIER_CODES.has(code)) return null;
  if (code.startsWith("Key") && /^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code.startsWith("Digit") && /^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code.startsWith("Numpad") && /^Numpad[0-9]$/.test(code)) return `Num${code.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (CODE_TO_TOKEN[code]) return CODE_TO_TOKEN[code];
  if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) return key.toUpperCase();
  return null;
}

/** Map a key event to a Tauri / global-hotkey accelerator, or null while only modifiers are held. */
export function eventToAccelerator(combo: KeyCombo): string | null {
  const token = keyToken(combo);
  if (!token) return null;
  const parts: string[] = [];
  if (combo.ctrlKey || combo.metaKey) parts.push("CommandOrControl");
  if (combo.altKey) parts.push("Alt");
  if (combo.shiftKey) parts.push("Shift");
  parts.push(token);
  return parts.join("+");
}

export function formatAccelerator(accel: string): string {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return accel
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl" || part === "Command" || part === "Cmd") return isMac ? "⌘" : "Ctrl";
      if (part === "Control" || part === "Ctrl") return "Ctrl";
      if (part === "Alt" || part === "Option") return isMac ? "⌥" : "Alt";
      if (part === "Shift") return isMac ? "⇧" : "Shift";
      if (part === "Super") return isMac ? "⌘" : "Win";
      return part;
    })
    .join("+");
}
