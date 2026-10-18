import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Input, Stack, Flex, Button, Select, Badge } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';

export default function ClubReferents({ clientId, onAssigned, compact=false }) {
  useTranslation();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch('/clubs/client-directory').then(setData);
  useEffect(() => { load().catch(e => { if (e.status !== 403) setError(clubText('Chargement impossible.')); }); }, []);
  const assign = async (client, coachUid) => {
    setBusy(true); setError('');
    try {
      await apiFetch('/clubs/client-directory/' + encodeURIComponent(client.id) + '/referent', {
        method: 'PATCH', body: JSON.stringify({ coachUid, version: client.version }),
      });
      await load(); onAssigned?.();
    } catch (e) {
      setError(clubText(e.data?.error) || clubText('Enregistrement impossible.'));
      await load().catch(() => {});
    } finally { setBusy(false); }
  };
  if (!data) return error ? <Text role="alert">{error}</Text> : null;
  const clients = data.clients.filter(c => clientId ? c.id === clientId : c.name.toLowerCase().includes(search.toLowerCase()));
  return <Box layerStyle="glassCard" p={{ base: 4, md: 5 }}>
    {clientId ? <Heading size="sm" mb={3}>{clubText('Suivi du client')}</Heading> :
      <Flex gap={3} align="center" mb={4}><Input aria-label={clubText('Rechercher un client')} value={search} onChange={e => setSearch(e.target.value)} placeholder={clubText('Rechercher un client')} /><Badge flexShrink={0}>{clients.length}</Badge></Flex>}
    <Stack spacing={3}>
      {clients.map(c => <Box key={c.id} borderWidth={compact?"0":"1px"} borderRadius="xl" p={compact?0:4}>
        <Flex gap={4} justify="space-between" align="center" flexWrap="wrap">
          <Box flex="1" minW="180px">{!compact && <Text fontWeight="bold">{c.name}</Text>}<Text fontSize="sm" opacity={0.75}>{clubText('Suivi par')} : {data.coaches.find(p => p.id === c.referentId)?.name || clubText('Non attribué')}</Text>
            {clientId && <Text fontSize="xs">{clubText('Inscrit par')} : {clubText(c.registeredByName || 'Non renseigné')}</Text>}
          </Box>
          <Box marginInlineStart="auto">
            {data.isOwner ? <Select aria-label={clubText('Attribuer un référent')} size="sm" value={c.referentId} isDisabled={busy} onChange={e => assign(c, e.target.value)}><option value="">{clubText('Non attribué')}</option>{data.coaches.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select> :
              !c.referentId ? <Button size="sm" isLoading={busy} onClick={() => assign(c, data.viewerId)}>{clubText('Prendre en charge')}</Button> :
                c.referentId === data.viewerId ? <Button as={Link} size="sm" to={'/clients/' + encodeURIComponent(c.id)}>{clubText('Ouvrir la fiche client')}</Button> : null}
          </Box>
        </Flex>
        {!clientId && <Box mt={3} fontSize="sm" borderTopWidth="1px" pt={3}>
          <Text><Text as="span" fontWeight="semibold">{clubText('Objectif sportif')} : </Text>{c.profile?.objective || clubText('Non renseigné')}</Text>
          <Text><Text as="span" fontWeight="semibold">{clubText('Niveau sportif')} : </Text>{c.profile?.level || clubText('Non renseigné')}</Text>
        </Box>}
      </Box>)}
      {!clients.length && <Text>{clubText('Aucun client dans ce périmètre.')}</Text>}
    </Stack>
    {error && <Text role="alert" color="red.500">{error}</Text>}
  </Box>;
}
