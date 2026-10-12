import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Heading, Text, Stack, HStack, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
import { useAppTheme } from '../../styles/appTheme';

export default function ClientMemberships({ noticeOnly = false }) {
  const { i18n } = useTranslation();
  const theme = useAppTheme(), toast = useToast();
  const [data, setData] = useState(null), [error, setError] = useState(''), [leaving, setLeaving] = useState(null), [busy, setBusy] = useState(false);
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
  if (noticeOnly && !data?.needsChoice) return null;
  return <Box {...theme.cardProps} p={5} mb={4}>
    <Heading size="md" mb={2}>{noticeOnly ? clubText("Vos accès aux clubs") : clubText("Mes clubs")}</Heading>
    {error ? <><Text role="alert">{error}</Text><Button onClick={() => load().catch(() => {})}>{clubText("Réessayer")}</Button></> : !data ? <Text>{clubText("Chargement des adhésions…")}</Text> : <Stack spacing={3}>
      {data.needsChoice && <Text>{clubText("Vous avez accès à plusieurs clubs. Souhaitez-vous conserver tous vos accès ou quitter un club ? Sans réponse, vos adhésions et réservations restent inchangées. Vous pourrez revenir sur ce choix dans vos paramètres.")}</Text>}
      {!data.memberships.length && <Text>{clubText("Vous n’êtes actuellement inscrit à aucun club.")}</Text>}
      {data.memberships.map(club => <HStack key={club.id} justify="space-between" flexWrap="wrap" gap={2}>
        <Box><Text fontWeight="bold">{club.name}</Text><Text fontSize="sm" color={theme.mutedText}>{clubText("Adhésion active")}</Text></Box>
        <Button variant="outline" size="sm" onClick={() => setLeaving(club)}>{clubText("Quitter ce club")}</Button>
      </HStack>)}
      {data.needsChoice && <Button alignSelf="start" isLoading={busy} onClick={() => act('/clubs/my-memberships/keep')}>{clubText("Conserver tous mes accès")}</Button>}
      <Text fontSize="sm" color={theme.mutedText}>{clubText("Ce choix est personnel : aucun club ne voit vos autres adhésions. Quitter le club ne supprime pas votre compte BYL et ne résilie pas un éventuel abonnement payant auprès du club.")}</Text>
    </Stack>}
    <Modal isOpen={!!leaving} onClose={() => !busy && setLeaving(null)} isCentered closeOnOverlayClick={!busy}>
      <ModalOverlay /><ModalContent><ModalHeader>{clubText("Quitter {{club}} ?", {club:leaving?.name})}</ModalHeader>
        <ModalBody><Stack spacing={3}>
          <Text>{clubText("Votre départ prendra effet immédiatement. Vos inscriptions et places en liste d’attente aux prochains cours collectifs de ce club seront retirées.")}</Text>
          <Text>{clubText("Les cours et la discussion de ce club ne seront plus accessibles. Vos autres clubs et vos suivis individuels sont conservés.")}</Text>
          <Text>{clubText("Le club conservera votre dossier et la date de départ. Il pourra réactiver votre adhésion avec le même compte si vous revenez.")}</Text>
        </Stack></ModalBody>
        <ModalFooter gap={2}><Button isDisabled={busy} variant="ghost" onClick={() => setLeaving(null)}>{clubText("Garder mon accès")}</Button><Button colorScheme="red" isLoading={busy} onClick={() => act(`/clubs/my-memberships/${encodeURIComponent(leaving.id)}/leave`)}>{clubText("Confirmer mon départ")}</Button></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>;
}
