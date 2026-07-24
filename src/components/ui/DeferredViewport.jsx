import React, { useEffect, useRef, useState } from "react";
import { Box } from "@chakra-ui/react";

export default function DeferredViewport({
  children,
  minHeight = 320,
  rootMargin = "500px 0px",
}) {
  const mountRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = mountRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver !== "function") {
      const timeoutId = window.setTimeout(() => setReady(true), 500);
      return () => window.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setReady(true);
        observer.disconnect();
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <Box
      ref={mountRef}
      minH={`${minHeight}px`}
      contentVisibility="auto"
      containIntrinsicSize={`${minHeight}px`}
    >
      {ready ? children : null}
    </Box>
  );
}
