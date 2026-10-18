import ClubTerminationModal from './ClubTerminationModal';
import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Heading, Text, Stack, HStack, Badge, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
import { useAppTheme } from '../../styles/appTheme';

export default function ClientMemberships({ noticeOnly = false, renderClubContent, additionalClubs = [] }) {
  const { i18n } = useTranslation();
  const theme = useAppTheme(), toast = useToast();
  const [data, setData] = useState(null), [error, setError] = useState(''), [leaving, setLeaving] = useState(null), [busy, setBusy] = useState(false);
  const [requests,setRequests]=useState([]);
  useEffect(()=>{let active=true;const refresh=()=>apiFetch('/clubs/my-termination-requests').then(d=>{if(active)setRequests(d.requests);}).catch(()=>{});refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('club-memberships-changed',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('club-memberships-changed',refresh);};},[]);
  const load = useCallback(async () => {
    const value = await apiFetch('/clubs/my-memberships'); setData(value); setError('');
  }, []);
  useEffect(() => {
    let alive = true;
    const refresh = () => apiFetch('/clubs/my-memberships').then(value => { if (alive) { setData(value); setError(''); } }).catch(() => { if (alive) setError(clubText("Impossible de charger vos adhésions.")); });
    refresh(); window.addEventListener('focus', refresh);
    return () => { alive = false; window.removeEventListener('focus', refresh); };
  }, [i18n.language]);
  const act = async path => {
    setBusy(true);
    try {
      await apiFetch(path, { method: 'POST' }); setLeaving(null); await load();
      window.dispatchEvent(new Event('club-memberships-changed'));
      toast({ title: path.endsWith('/leave') ? clubText("Votre départ du club est enregistré") : clubText("Vos accès sont conservés"), status: 'success' });
    } catch (e) { toast({ title: clubText(e?.data?.error) || clubText("Modification impossible. Réessayez."), status: 'error' }); }
    finally { setBusy(false); }
  };
  const memberships=data?.memberships||[];
  const clubs=[...memberships,...additionalClubs.filter(club=>!memberships.some(member=>member.id===club.id))];
  if (noticeOnly && !data?.needsChoice) return null;
  return <Box {...theme.cardProps} p={5} mb={4}>
    <Heading size="md" mb={2}>{noticeOnly ? clubText("Vos accès aux clubs") : clubText("Mes clubs")}</Heading>
    {error ? <><Text role="alert">{error}</Text><Button onClick={() => load().catch(() => {})}>{clubText("Réessayer")}</Button></> : !data ? <Text>{clubText("Chargement des adhésions…")}</Text> : <Stack spacing={3}>
      {data.needsChoice && <Text>{clubText("Vous avez accès à plusieurs clubs. Souhaitez-vous conserver tous vos accès ou quitter un club ? Sans réponse, vos adhésions et réservations restent inchangées. Vous pourrez revenir sur ce choix dans vos paramètres.")}</Text>}
      {!clubs.length && <Text>{clubText("Vous n’êtes actuellement inscrit à aucun club.")}</Text>}
      {clubs.map(club => <Box key={club.id}><HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Box><Text fontWeight="bold">{club.name}</Text>{memberships.some(member=>member.id===club.id)&&<Text fontSize="sm" color={theme.mutedText}>{clubText("Adhésion active")}</Text>}</Box>
        {memberships.some(member=>member.id===club.id)&&<Button variant="outline" size="sm" onClick={() => setLeaving(club)}>{clubText(requests.some(r=>r.clubId===club.id)?'Voir la demande de résiliation':'Quitter ce club')}</Button>}
      </HStack>{renderClubContent&&<Box mt={3}>{renderClubContent(club)}</Box>}</Box>)}
      {requests.filter(r=>!memberships.some(c=>c.id===r.clubId)).map(r=><Box key={r.clubId} borderWidth="1px" borderRadius="lg" p={3}><Badge>{clubText(({pending:'Demande en attente',accepted:'Résiliation acceptée',rejected:'Résiliation refusée',end_of_term:'Départ à la fin de l’abonnement'})[r.status])}</Badge>{r.note&&<Text whiteSpace="pre-wrap">{r.note}</Text>}<Button mt={2} size="sm" onClick={()=>setLeaving({id:r.clubId,name:''})}>{clubText('Voir la demande de résiliation')}</Button></Box>)}
      {data.needsChoice && <Button alignSelf="start" isLoading={busy} onClick={() => act('/clubs/my-memberships/keep')}>{clubText("Conserver tous mes accès")}</Button>}
      <Text fontSize="sm" color={theme.mutedText}>{clubText("Ce choix est personnel : aucun club ne voit vos autres adhésions. Quitter le club ne supprime pas votre compte BYL et ne résilie pas un éventuel abonnement payant auprès du club.")}</Text>
    </Stack>}
    {leaving&&<ClubTerminationModal club={leaving} onClose={()=>setLeaving(null)}/>}
  </Box>;
}
