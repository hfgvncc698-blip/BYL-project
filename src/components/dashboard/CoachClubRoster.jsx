import { useEffect, useState } from 'react';
import { Box, Heading, Text, Stack, Spinner, HStack, Badge } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';

export default function CoachClubRoster({eventId}) {
  useTranslation();
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;setData(null);setError('');
    apiFetch(`/clubs/coach-appointments/${encodeURIComponent(eventId)}/participants`).then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError(clubText('Chargement impossible.'));});
    return()=>{active=false;};
  },[eventId]);
  if(error)return <Text role="alert">{error}</Text>;
  if(!data)return <Spinner/>;
  const row=(id,waiting=false)=>{
    const client=data.clients.find(c=>c.id===id);
    return <Box key={id} borderWidth="1px" borderRadius="lg" p={3}>
      <HStack justify="space-between"><Text fontWeight="bold">{client?.name||clubText('Participant indisponible')}</Text>{waiting&&<Badge>{clubText('Liste d’attente')}</Badge>}</HStack>
      {client?.packs.length ? client.packs.map(p=><Box key={p.id} mt={1}><Text fontSize="sm">{p.name} · {clubText('{{remaining}} / {{total}} séances restantes',{remaining:p.remaining,total:p.quantity})}</Text><Text fontSize="xs">{clubText('{{reserved}} réservées · {{available}} disponibles',{reserved:p.reserved,available:p.available})}</Text></Box>) : <Text fontSize="sm">{clubText('Aucun pack pour ce cours')}</Text>}
    </Box>;
  };
  return <Stack mb={4} spacing={2}><Heading size="sm">{clubText('Participants')} · {data.participantIds.length}/{data.capacity}</Heading>{data.participantIds.map(id=>row(id))}{data.waitlistIds.map(id=>row(id,true))}</Stack>;
}
