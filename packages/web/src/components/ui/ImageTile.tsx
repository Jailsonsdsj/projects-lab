import { useCallback, useState } from "react";
import { cx } from "./cx";

export interface ImageTileProps {
  /** Photo URL; without one the tile shows initials. */
  src?: string;
  /** The person's name: the alt text and the source of the initials. */
  name: string;
  size?: "md" | "lg";
  round?: boolean;
  className?: string;
}

type TileState = "loading" | "loaded" | "failed";

/** "Sam Rivera" → "SR". */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A profile photo tile. Loading shimmers, a failed or missing photo falls back
 * to initials on the lab tint; both are driven by the image's own load and
 * error events, never by a timer.
 */
export function ImageTile({
  src,
  name,
  size = "md",
  round,
  className,
}: ImageTileProps) {
  const [state, setState] = useState<TileState>(src ? "loading" : "failed");
  const [shownSrc, setShownSrc] = useState(src);
  if (src !== shownSrc) {
    setShownSrc(src);
    setState(src ? "loading" : "failed");
  }

  // A cached image can finish before React attaches onLoad.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setState("loaded");
  }, []);

  const classes = cx(
    "tile",
    size === "lg" && "tile--lg",
    round && "tile--round",
    state === "loading" && "is-loading",
    state === "failed" && "is-failed",
    className,
  );

  if (state === "failed" || !src) {
    return (
      <span className={classes} role="img" aria-label={name}>
        <span className="tile__initials" aria-hidden="true">
          {initialsOf(name)}
        </span>
      </span>
    );
  }

  return (
    <span className={classes} aria-busy={state === "loading" || undefined}>
      <img
        ref={imgRef}
        className="tile__photo"
        src={src}
        alt={name}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </span>
  );
}
