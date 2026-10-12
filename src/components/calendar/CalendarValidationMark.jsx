import React, { useEffect, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { CheckIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { calendarEventValidated } from '../../utils/calendarEventAppearance.mjs';
export function useCalendarClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick(value => value + 1);
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
}
export default function CalendarValidationMark({ event }) {
  const { t } = useTranslation();
  if (!calendarEventValidated(event)) return null;
  const label = t('status.validated', 'Validé');
  return <Box as="span" role="img" aria-label={label} title={label} position="absolute" top="3px" right="3px" w="15px" h="15px" borderRadius="full" bg="white" color="green.700" display="inline-flex" alignItems="center" justifyContent="center" pointerEvents="none" zIndex={1}>
    <CheckIcon boxSize="9px" />
  </Box>;
}
