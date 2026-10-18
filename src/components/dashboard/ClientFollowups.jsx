import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Heading, Text, HStack, SimpleGrid, Circle, VStack, Switch } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';
export default function ClientFollowups({settings=false,compact=false,onVisibilityChange}) {
  useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null), [busy,setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const next=await apiFetch('/clubs/my-followups'); setData(next); onVisibilityChange?.(next.followups.filter(f=>f.hidden).map(f=>f.id)); setError(''); }
    catch { setError(clubText('Chargement impossible.')); }
  }, [onVisibilityChange]);
  useEffect(() => { load(); window.addEventListener('focus', load); return () => window.removeEventListener('focus', load); }, [load, user?.uid]);
  const changeVisibility=async(f,visible)=>{setBusy(true);try{await apiFetch('/clubs/my-followups/visibility',{method:'POST',body:JSON.stringify({clientId:f.id,hidden:!visible})});await load();}catch{setError(clubText('Enregistrement impossible.'));}finally{setBusy(false);}};
  return <Box layerStyle="glassCard" p={compact?3:4} mb={compact?0:4}>
    <HStack justify="space-between" mb={2}><Heading size="sm">{clubText('Mes accompagnements')}</Heading><Button size="xs" variant="ghost" onClick={load} isDisabled={busy}>{clubText('Actualiser')}</Button></HStack>
    <Text fontSize={compact?'xs':'sm'} mb={compact?2:3}>{clubText(settings&&!compact ? 'Les dossiers restent séparés. Décochez un accompagnement pour le masquer sur l’accueil. Le suivi et les données sont conservés.' : 'Retrouvez vos contenus sur un même accueil. Chaque couleur identifie son accompagnement.')}</Text>
    {data?.followups.length > 0 && <SimpleGrid columns={{base:1, md:3}} spacing={3} role="group" aria-label={clubText('Accompagnement affiché')}>
      {data.followups.filter(f=>settings||!f.hidden).map(f => {
        const palette = ['#2563EB', '#7C3AED', '#0F766E', '#BE185D'];
        const key = f.coachUid || f.coachId || f.id;
        const hash = [...key].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
        const color = f.personal ? '#64748B' : palette[hash % palette.length];
        const selected = false;
        return <Box key={f.id} h="auto" minH={compact?"48px":"88px"} p={compact?2:4} borderRadius="xl" whiteSpace="normal" justifyContent="flex-start"
          borderWidth={selected ? '2px' : '1px'} borderColor={selected ? color : undefined}
          borderLeftWidth="5px" borderLeftColor={color} >
          <HStack spacing={compact?2:3} textAlign="start"><Circle size={compact?"24px":"36px"} fontSize={compact?"xs":"sm"} bg={color} color="white" flexShrink={0} aria-hidden="true">
            {f.personal ? '•' : (f.coachName || '?').split(' ').map(n=>n[0]).slice(0,2).join('')}
          </Circle><VStack align="start" spacing={1}>
            <Text fontWeight="bold" fontSize={compact?"sm":undefined}>{f.personal ? clubText('Espace personnel') : f.coachName || clubText('Non attribué')}</Text>
            {!f.personal && <Text fontSize={compact?"xs":"sm"} fontWeight="normal">{f.clubName || clubText('Suivi indépendant')}</Text>}
          </VStack>{settings&&<Switch ml="auto" aria-label={clubText('Afficher {{name}} sur l’accueil',{name:f.coachName||clubText('Espace personnel')})} isChecked={!f.hidden} isDisabled={busy} onChange={e=>changeVisibility(f,e.target.checked)}/>}</HStack>
        </Box>;
      })}
    </SimpleGrid>}

    {!settings&&<Button as={RouterLink} to="/profile?tab=suivi" size="sm" variant="link" mt={3}>{clubText("Gérer mes accompagnements")}</Button>}
    {error&&<Text role="alert" color="red.500">{error}</Text>}
  </Box>;
}
