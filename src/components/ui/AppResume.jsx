import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { createResumeRefresh } from '../../utils/appResume';

export default function AppResume() {
  const location = useLocation();
  const route = useRef(location.pathname);
  const dirty = useRef(false);
  const checkRef = useRef(null);
  useEffect(() => {
    route.current = location.pathname;
    dirty.current = false;
    checkRef.current?.();
  }, [location.pathname]);
  useEffect(() => {
    const shouldReload = createResumeRefresh();
    let focused = true;
    const check = () => {
      const dialogOpen = !!document.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"], fieldset');
      if (shouldReload({
        visible: document.visibilityState === 'visible', online: navigator.onLine,
        away: !focused, pathname: route.current, dirty: dirty.current, dialogOpen,
      })) window.location.reload();
    };
    checkRef.current = check;
    const focus = () => { focused = true; check(); };
    const blur = () => { focused = false; check(); };
    const edit = event => {
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) dirty.current = true;
    };
    const interval = setInterval(check, 30000);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    document.addEventListener('input', edit, true);
    document.addEventListener('change', edit, true);
    return () => {
      checkRef.current = null;
      clearInterval(interval);
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
      document.removeEventListener('input', edit, true);
      document.removeEventListener('change', edit, true);
    };
  }, []);
  return null;
}
