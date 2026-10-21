import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Box, Button, Text, useToast } from '@chakra-ui/react';
import { canAutoReloadOnResume, createResumeDetector } from '../../utils/appResume';

function ResumeNotice({ onClose, reload }) {
  const { t, i18n } = useTranslation('common');
  return (
    <Box bg="gray.800" color="white" p={4} borderRadius="lg" boxShadow="lg" role="status" dir={i18n.dir()}>
      <Text fontWeight="bold">{t('appResume.title')}</Text>
      <Text fontSize="sm" mt={1}>{t('appResume.description')}</Text>
      <Button size="sm" mt={3} marginInlineEnd={2} onClick={reload}>{t('appResume.refresh')}</Button>
      <Button size="sm" mt={3} variant="outline" color="white" onClick={onClose}>{t('appResume.later')}</Button>
    </Box>
  );
}

export default function AppResume() {
  const location = useLocation();
  const route = useRef(location.pathname);
  const dirty = useRef(false);
  const toast = useToast();
  useEffect(() => {
    route.current = location.pathname;
    dirty.current = false;
  }, [location.pathname]);
  useEffect(() => {
    const detect = createResumeDetector();
    const toastId = 'app-resume';
    const reload = () => window.location.reload();
    const check = (away = false) => {
      if (!detect({ visible: document.visibilityState === 'visible', online: navigator.onLine, away })) return;
      const dialogOpen = !!document.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"], fieldset');
      if (canAutoReloadOnResume({ pathname: route.current, dirty: dirty.current, dialogOpen })) {
        reload();
      } else if (!toast.isActive(toastId)) {
        toast({ id: toastId, duration: null, position: 'bottom', render: ({ onClose }) => (
          <ResumeNotice onClose={onClose} reload={reload} />
        ) });
      }
    };
    const resume = () => check();
    const away = () => check(true);
    const edit = event => {
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) dirty.current = true;
    };
    const interval = setInterval(resume, 30000);
    window.addEventListener('focus', resume);
    window.addEventListener('blur', away);
    window.addEventListener('online', resume);
    window.addEventListener('offline', away);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('input', edit, true);
    document.addEventListener('change', edit, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', resume);
      window.removeEventListener('blur', away);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', away);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('input', edit, true);
      document.removeEventListener('change', edit, true);
    };
  }, [toast]);
  return null;
}
