import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface EditorMenuProps {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export default function EditorMenu({ label, open, onOpenChange, children }: EditorMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open, onOpenChange]);

  return (
    <div className="editor-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`topbar-menu-trigger${open ? " active" : ""}`}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") onOpenChange(true);
          if (event.key === "Escape") onOpenChange(false);
        }}
        type="button"
      >
        {label}
      </button>
      {open && <div className="editor-menu-popover" role="menu">{children}</div>}
    </div>
  );
}
