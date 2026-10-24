import React, { useEffect, useState } from 'react';
import { Box, Text, Wrap, Badge, Button } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../styles/appTheme';
import { getAuthHeaders } from '../../utils/authHeaders';
import { getApiBase } from '../../utils/apiBase';
import { authState } from '../../utils/adminDiagnostics';

export default function AdminAccessSummary({ uid, account, onEmails, onAccess }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [state, setState] = useState({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ loading: true });
    const timer = setTimeout(() => controller.abort(), 15000);
    (async () => {
      if (!uid) { if (active) setState({}); return; }
      try {
        const response = await fetch(`${getApiBase()}/admin-users/email-verification-statuses`, {
          method: 'POST', headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ uids: [uid] }), signal: controller.signal,
        });
        if (!response.ok) throw new Error('lookup');
        const data = await response.json();
        if (active) setState({ status: data.statuses?.[uid], at: new Date() });
      } catch { if (active) setState({ error: true }); }
      finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [uid, refresh]);
  const status = authState(state.status);
  return <Box as="details" {...theme.cardProps} p={4} mb={2}>
    <Box as="summary" cursor="pointer" fontWeight="700">
      {t('adminLayout.signInStatus')} · {t(`adminSupport.${status}`)}
    </Box>
    <Text fontSize="sm" my={3}>{t('adminLayout.signInHint')}</Text>
    <Wrap spacing={2}>
      <Badge>{t(`adminSupport.${account ? 'account' : 'record'}`)}</Badge>
      <Badge colorScheme={status === 'enabled' ? 'green' : status === 'unknown' ? 'gray' : 'orange'}>{t(`adminSupport.${status}`)}</Badge>
      <Badge>{t('adminSupport.email')}: {state.status && !state.status.notFound ? t(`adminSupport.${state.status.emailVerified ? 'verified' : 'unverified'}`) : t('adminSupport.unknown')}</Badge>
    </Wrap>
    {state.error && <Text color="orange.500">{t('adminSupport.failed')}</Text>}
    {state.at && <Text fontSize="xs" mt={2}>{t('adminSupport.checked')}: {state.at.toLocaleTimeString()}</Text>}
    <Wrap mt={3}>
      {onEmails && <Button size="sm" onClick={onEmails}>{t('auto.AdminEmails.emails', 'E-mails')}</Button>}
      {onAccess && <Button size="sm" onClick={onAccess}>{t('adminLayout.manageAccount')}</Button>}
    </Wrap>
    <Button size="sm" mt={2} variant="outline" isLoading={state.loading} onClick={() => setRefresh(x => x + 1)}>{t('adminSupport.refresh')}</Button>
  </Box>;
}
