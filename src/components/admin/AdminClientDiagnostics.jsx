import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Heading, Text, Alert, AlertIcon, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../styles/appTheme';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocFromServer as getDoc, getDocsFromServer as getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { diagnoseClient } from '../../utils/adminDiagnostics';

async function mapBounded(items, read) {
  let next = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await read(items[i]); }
  }));
  return out;
}

export default function AdminClientDiagnostics({ clientId }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const navigate = useNavigate();
  const [state, setState] = useState({});
  const generation = useRef(0);
  useEffect(() => { generation.current++; setState({}); return () => { generation.current++; }; }, [clientId]);
  const run = async () => {
    const version = ++generation.current;
    setState({ loading: true });
    const deadline = setTimeout(() => {
      if (version === generation.current) { generation.current++; setState({ error: true }); }
    }, 30000);
    try {
      const [profile, snapshot] = await Promise.all([
        getDoc(doc(db, 'clients', clientId)), getDocs(collection(db, 'clients', clientId, 'programmes')),
      ]);
      if (!profile.exists()) throw new Error('missing-profile');
      const programs = await mapBounded(snapshot.docs, async p => {
        const history = await getDocs(collection(p.ref, 'sessionsEffectuees'));
        return { ...p.data(), id: p.id, _progressSessionsEffectuees: history.docs.map(s => ({ ...s.data(), id: s.id })) };
      });
      const ids = [...new Set(programs.flatMap(p => p._progressSessionsEffectuees.map(s => s.calendarEventId).filter(Boolean)))];
      const events = new Map(await mapBounded(ids, async id => {
        // Session completion writes the root event and the client calendar mirror.
        const [root, mirror] = await Promise.all([getDoc(doc(db, 'sessions', id)), getDoc(doc(db, 'clients', clientId, 'calendarEvents', id))]);
        return [id, root.exists() ? root.data() : mirror.exists() ? mirror.data() : null];
      }));
      if (version === generation.current) setState({ result: diagnoseClient(profile.data(), programs, events), at: new Date() });
    } catch { if (version === generation.current) setState({ error: true }); }
    finally { clearTimeout(deadline); }
  };
  return <Box id="admin-consistency" {...theme.cardProps} p={5} mb={2}>
    <Heading size="sm">{t('adminSupport.consistency')}</Heading>
    <Text fontSize="sm" my={2}>{t('adminSupport.scope')}</Text>
    <Button size="sm" onClick={run} isLoading={state.loading} isDisabled={!clientId}>{t('adminSupport.check')}</Button>
    {state.error && <Alert status="warning" mt={3}><AlertIcon />{t('adminSupport.failed')}</Alert>}
    {state.result && <VStack align="stretch" spacing={3} mt={3}>
      <Text fontSize="xs">{t('adminSupport.checked')}: {state.at.toLocaleString()}</Text>
      {state.result.current && <Text fontWeight="bold">{state.result.current.nomProgramme || state.result.current.name || state.result.current.id} · {state.result.current._done}/{state.result.current._total}</Text>}
      {!state.result.issues.length && <Alert status="success"><AlertIcon />{t('adminSupport.clear')}</Alert>}
      {state.result.issues.map((issue, i) => <Alert key={i} status="warning" alignItems="start"><AlertIcon /><Box>
        <Text>{t(`adminSupport.${issue.code}`, issue)}</Text>
        <Text fontSize="xs">{issue.programId}{issue.sessionId ? ` · ${issue.sessionId}` : ''}</Text>
      </Box></Alert>)}
      <Button size="sm" alignSelf="start" onClick={() => navigate(`/clients/${encodeURIComponent(clientId)}#training-cycles`)}>{t('adminSupport.open')}</Button>
    </VStack>}
  </Box>;
}
