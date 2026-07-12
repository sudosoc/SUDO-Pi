import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function useNavHistory() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const stack     = useRef<string[]>([]);
  const pos       = useRef<number>(-1);
  const isInternal = useRef(false);
  const [canGoBack,    setCanGoBack]    = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    if (isInternal.current) { isInternal.current = false; return; }

    const path = location.pathname;
    // Trim forward history on fresh navigation
    stack.current = stack.current.slice(0, pos.current + 1);
    stack.current.push(path);
    pos.current   = stack.current.length - 1;
    setCanGoBack(pos.current > 0);
    setCanGoForward(false);
  }, [location.pathname]);

  const goBack = useCallback(() => {
    if (pos.current <= 0) return;
    isInternal.current = true;
    pos.current -= 1;
    setCanGoBack(pos.current > 0);
    setCanGoForward(true);
    navigate(stack.current[pos.current]);
  }, [navigate]);

  const goForward = useCallback(() => {
    if (pos.current >= stack.current.length - 1) return;
    isInternal.current = true;
    pos.current += 1;
    setCanGoBack(true);
    setCanGoForward(pos.current < stack.current.length - 1);
    navigate(stack.current[pos.current]);
  }, [navigate]);

  return { canGoBack, canGoForward, goBack, goForward };
}
