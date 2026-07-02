import { useEffect, useRef, useState } from "react";

// ─── Loading bus ──────────────────────────────────────────────────────────────
// Tiny module-level pub/sub counting in-flight requests. The API client calls
// start()/done(); the bar component subscribes.

type Listener = (activeCount: number) => void;

let activeCount = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((cb) => cb(activeCount));
}

export const loadingBus = {
  start(): void {
    activeCount += 1;
    emit();
  },
  done(): void {
    activeCount = Math.max(0, activeCount - 1);
    emit();
  },
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    cb(activeCount);
    return () => {
      listeners.delete(cb);
    };
  },
};

// ─── Component ────────────────────────────────────────────────────────────────
// A 2px fixed bar at the very top. Only appears if loading persists >150ms
// (so rapid polls never flash it). Starts at 15%, trickles +8% every 400ms up
// to 85%, then jumps to 100% and fades out when the count hits zero.

const SHOW_DELAY_MS = 150;
const TRICKLE_INTERVAL_MS = 400;
const TRICKLE_STEP = 8;
const START_WIDTH = 15;
const MAX_TRICKLE_WIDTH = 85;
const FINISH_MS = 200;

interface BarState {
  visible: boolean;
  width: number;
  fading: boolean;
}

const IDLE: BarState = { visible: false, width: 0, fading: false };

export function GlobalLoadingBar() {
  const [bar, setBar] = useState<BarState>(IDLE);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loadingRef = useRef(false);

  useEffect(() => {
    const clearShow = () => {
      if (showTimer.current !== null) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    };
    const clearTrickle = () => {
      if (trickleTimer.current !== null) {
        clearInterval(trickleTimer.current);
        trickleTimer.current = null;
      }
    };
    const clearFinish = () => {
      finishTimers.current.forEach(clearTimeout);
      finishTimers.current = [];
    };

    const unsubscribe = loadingBus.subscribe((count) => {
      const isLoading = count > 0;

      if (isLoading && !loadingRef.current) {
        loadingRef.current = true;
        clearFinish();
        clearShow();
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          if (!loadingRef.current) return; // finished within the delay window
          setBar({ visible: true, width: START_WIDTH, fading: false });
          clearTrickle();
          trickleTimer.current = setInterval(() => {
            setBar((s) =>
              s.visible && !s.fading
                ? { ...s, width: Math.min(MAX_TRICKLE_WIDTH, s.width + TRICKLE_STEP) }
                : s
            );
          }, TRICKLE_INTERVAL_MS);
        }, SHOW_DELAY_MS);
      } else if (!isLoading && loadingRef.current) {
        loadingRef.current = false;
        clearShow();
        clearTrickle();
        // Finish sequence: fill to 100%, fade out, then reset to idle.
        setBar((s) => (s.visible ? { ...s, width: 100 } : s));
        finishTimers.current.push(
          setTimeout(() => {
            setBar((s) => (s.visible ? { ...s, fading: true } : s));
          }, FINISH_MS)
        );
        finishTimers.current.push(
          setTimeout(() => {
            setBar(IDLE);
          }, FINISH_MS * 2)
        );
      }
    });

    return () => {
      unsubscribe();
      clearShow();
      clearTrickle();
      clearFinish();
    };
  }, []);

  if (!bar.visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[80] h-0.5"
      role="progressbar"
      aria-label="Loading"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
        style={{
          width: `${bar.width}%`,
          opacity: bar.fading ? 0 : 1,
          transition: `width ${FINISH_MS}ms ease-out, opacity ${FINISH_MS}ms ease-out`,
        }}
      />
    </div>
  );
}
