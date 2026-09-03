import { ReactNode, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  disabled?: boolean;
}

const THRESHOLD = 70; // px pulled before a refresh fires
const MAX = 120; // max visual pull distance
const RESIST = 0.5; // finger travel -> visual travel (rubber-band feel)

// Instagram-style pull-to-refresh: when the page is scrolled to the very top and
// the user drags down, a spinner is revealed; releasing past the threshold calls
// onRefresh. Uses window touch events, so it works with the app's body scroll.
export function PullToRefresh({ onRefresh, children, disabled }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const engaged = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (disabled || refreshingRef.current || !atTop()) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      engaged.current = false;
      setAnimate(false);
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !atTop()) {
        engaged.current = false;
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      engaged.current = true;
      if (e.cancelable) e.preventDefault(); // suppress native rubber-band while pulling
      setPull(Math.min(dy * RESIST, MAX));
    };

    const onEnd = () => {
      if (startY.current == null) return;
      const shouldRefresh = engaged.current && pullRef.current >= THRESHOLD;
      startY.current = null;
      engaged.current = false;
      setAnimate(true);
      if (shouldRefresh) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.7);
        Promise.resolve(onRefresh()).finally(() => {
          setRefreshing(false);
          setPull(0);
        });
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, onRefresh]);

  const progress = Math.min(pull / THRESHOLD, 1);
  const indicatorH = refreshing ? THRESHOLD * 0.7 : pull;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: indicatorH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: indicatorH > 4 ? 1 : 0,
        }}
      >
        <LoaderCircle
          className={`w-6 h-6 text-[#1E6FD9] ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
      <div
        style={{
          transform: `translateY(${indicatorH}px)`,
          transition: animate ? "transform 0.25s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
