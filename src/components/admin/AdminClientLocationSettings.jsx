import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Badge, HStack, Stack } from '@chakra-ui/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function AdminClientLocationSettings({ uid }) {
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    setSnapshot(null);
    setState(uid ? 'loading' : 'empty');
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), result => {
      setSnapshot(result.data()?.locationSettings || null);
      setState('ready');
    }, () => setState('error'));
  }, [uid]);
  const permissionLabels = { granted: 'Autorisée', denied: 'Bloquée', prompt: 'À demander', unknown: 'Non renseignée', unsupported: 'Non prise en charge' };
  const date = snapshot?.updatedAt?.toDate?.();
  return <Box mt={4} p={4} borderWidth="1px" borderRadius="xl">
    <Heading size="sm">Localisation · réglages du client</Heading>
    {state === 'loading' ? <Text mt={2}>Chargement…</Text> : state === 'error' ? <Text mt={2}>Réglages indisponibles pour le moment.</Text> : !snapshot ?
      <Text mt={2} fontSize="sm">Réglages pas encore transmis par le navigateur du client. Ils seront visibles après sa prochaine ouverture du site mis à jour.</Text> : <>
        <Stack mt={3} spacing={2}>
          <HStack justify="space-between"><Text fontSize="sm">Localisation dans le site</Text><Badge>{snapshot.preference === null ? (snapshot.analyticsEnabled ? 'Activée par défaut' : 'Désactivée par défaut') : snapshot.preference ? 'Activée' : 'Désactivée'}</Badge></HStack>
          <HStack justify="space-between"><Text fontSize="sm">Consentement aux statistiques</Text><Badge>{snapshot.analyticsEnabled ? 'Activé' : 'Désactivé'}</Badge></HStack>
          <HStack justify="space-between"><Text fontSize="sm">Autorisation du navigateur</Text><Badge>{permissionLabels[snapshot.browserPermission] || 'Non renseignée'}</Badge></HStack>
        </Stack>
        <Text fontSize="xs" mt={3}>Dernier état transmis{date ? ` le ${date.toLocaleString('fr-FR')}` : ''}, sur le dernier navigateur utilisé. Il peut différer sur un autre appareil. « Bloquée » ne confirme pas un clic sur « Refuser ».</Text>
      </>}
  </Box>;
}
