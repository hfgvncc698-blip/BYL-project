import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, HStack, Spinner, Text, useToast } from '@chakra-ui/react';
import { canAutoReloadOnResume } from '../../utils/appResume';
import { createPullGesture, pullTargetBlocked, PULL_THRESHOLD } from '../../utils/pullToRefresh';

export default function PullToRefresh() {
  const { t, i18n } = useTranslation('common');
  const location = useLocation();
  const toast = useToast();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const text = useRef(t);
  text.current = t;
  useEffect(() => {
    const gesture = createPullGesture();
    let dirty = false;
    let busy = false;
    setDistance(0);
    const root = document.documentElement;
    const body = document.body;
    const oldRoot = root.style.overscrollBehaviorY;
    const oldBody = body.style.overscrollBehaviorY;
    // Avoid the browser's native refresh running alongside our guarded gesture.
    root.style.overscrollBehaviorY = 'none';
    body.style.overscrollBehaviorY = 'none';
    const atTop = () => window.scrollY <= 1 && (document.scrollingElement?.scrollTop || 0) <= 1;
    const blocked = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]');
    const reset = () => { gesture.cancel(); setDistance(0); };
    const start = event => {
      const touch = event.touches[0];
      if (!touch) return;
      gesture.start({ x: touch.clientX, y: touch.clientY, touches: event.touches.length, atTop: atTop(),
        blocked: busy || blocked() || pullTargetBlocked(event.target, root, node => window.getComputedStyle(node)) });
    };
    const move = event => {
      const touch = event.touches[0];
      if (!touch || blocked()) { reset(); return; }
      const next = gesture.move({ x: touch.clientX, y: touch.clientY, touches: event.touches.length, atTop: atTop() });
      if (next && !event.cancelable) { reset(); return; }
      if (next) event.preventDefault();
      setDistance(next);
    };
    const end = () => {
      const shouldRefresh = gesture.end();
      setDistance(0);
      if (!shouldRefresh || busy || blocked() || !atTop()) return;
      if (!navigator.onLine) {
        toast({ id: 'pull-offline', title: text.current('pullRefresh.offline'), status: 'info', isClosable: true });
        return;
      }
      if (!canAutoReloadOnResume({ pathname: location.pathname, dirty, dialogOpen: !!document.querySelector('fieldset') }) &&
          !window.confirm(text.current('pullRefresh.confirm'))) return;
      busy = true;
      setRefreshing(true);
      window.location.reload();
    };
    const edit = event => {
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) dirty = true;
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    document.addEventListener('input', edit, true);
    document.addEventListener('change', edit, true);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', reset);
      document.removeEventListener('input', edit, true);
      document.removeEventListener('change', edit, true);
      root.style.overscrollBehaviorY = oldRoot;
      body.style.overscrollBehaviorY = oldBody;
    };
  }, [location.key, location.pathname, toast]);
  if (!distance && !refreshing) return null;
  return <Box position="fixed" top="calc(env(safe-area-inset-top, 0px) + 12px)" left="50%"
    transform={`translate(-50%, ${Math.min(distance / 3, 48)}px)`} zIndex={2000} pointerEvents="none"
    bg="white" color="gray.800" boxShadow="lg" borderRadius="full" px={4} py={3} maxW="90vw" dir={i18n.dir()}>
    <HStack spacing={2} role="status" aria-live="polite">
      {refreshing ? <Spinner size="sm" /> : <Text aria-hidden="true">{distance >= PULL_THRESHOLD ? '↻' : '↓'}</Text>}
      <Text fontSize="sm">{t(refreshing ? 'pullRefresh.refreshing' : distance >= PULL_THRESHOLD ? 'pullRefresh.release' : 'pullRefresh.pull')}</Text>
    </HStack>
  </Box>;
}
