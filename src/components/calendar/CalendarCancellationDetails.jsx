import { useEffect, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../utils/api';
import { coachEventDisplayState } from '../../utils/calendarEventAppearance.mjs';

export default function CalendarCancellationDetails({ event = {}, audience = 'professional' }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const id = event.linkedSessionId || event._sourceId || event.id;
  useEffect(() => {
    setDetail(null);
    if (!event.excuseDecision || !id) return;
    let active = true;
    const path = audience === 'client' ? '/coach-sessions/my-cancellations?history=true' : '/coach-sessions/cancellation-requests?history=true';
    apiFetch(path).then(data => {
      if (active) setDetail((data.requests || []).find(item => item.id === id) || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [id, event.excuseDecision, event.excuseReviewedAt, audience]);
  if (coachEventDisplayState(event) !== 'cancelled') return null;
  return <Box mt={2}>
    {event.excuseDecision && <Text fontSize="sm" fontWeight="bold">{t(`status.cancellation_${detail?.decision || event.excuseDecision}`)}</Text>}
    <Text fontSize="sm" whiteSpace="pre-wrap">{t('status.cancellation_reason')}: {detail?.reason || event.cancellationReason || t('status.reason_unavailable')}</Text>
    {(detail?.reviewNote || event.excuseReviewNote) && <Text fontSize="sm" whiteSpace="pre-wrap">{t('status.review_reason')}: {detail?.reviewNote || event.excuseReviewNote}</Text>}
  </Box>;
}
