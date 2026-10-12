import { useState } from 'react';
import { Box, Button, Checkbox, Heading, Text, Stack, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';

export default function ClubDeparture() {
  useTranslation();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError(''); setConfirmed(false);
    try { setPreview(await apiFetch('/clubs/my-departure')); }
    catch (e) { setError(clubText(e.data?.error || 'Chargement impossible.')); }
    finally { setBusy(false); }
  };
  const leave = async () => {
    if (!confirmed || busy) return;
    setBusy(true); setError('');
    try {
      await apiFetch('/clubs/my-departure', { method: 'POST', body: JSON.stringify({ confirm: true, version: preview.version }) });
      // Reload AuthContext after the transition before the user selects a personal plan.
      window.location.assign('/plans/professionnel');
    } catch (e) { setError(clubText(e.data?.error || 'Enregistrement impossible.')); setConfirmed(false); setBusy(false); }
  };
  return <Box mt={4}>
    <Heading size="sm">{clubText('Passer en indépendant')}</Heading>
    <Text mt={2} fontSize="sm">{clubText('Quittez le club en conservant votre compte, puis choisissez votre abonnement personnel.')}</Text>
    <Button mt={3} variant="outline" onClick={load} isLoading={busy && !preview}>{clubText('Préparer mon départ')}</Button>
    {!preview && error && <Text role="alert" mt={2} color="red.500">{error}</Text>}
    <Modal isOpen={!!preview} onClose={() => { if (!busy) setPreview(null); }} size="xl" scrollBehavior="inside" isCentered closeOnOverlayClick={!busy}>
      <ModalOverlay /><ModalContent><ModalHeader>{clubText('Passer en indépendant')}</ModalHeader><ModalCloseButton isDisabled={busy}/>
        <ModalBody><Stack spacing={4}>
          <Text fontWeight="bold">{preview?.clubName}</Text>
          <Text>{clubText('Votre compte reste actif. L’accès professionnel reprendra après activation de votre abonnement personnel.')}</Text>
          {[
            ['Clients personnels conservés', preview?.personalClients],
            ['Programmes personnels conservés', preview?.personalPrograms],
            ['Clients restant au club', preview?.clubClients],
            ['Programmes restant au club', preview?.clubPrograms],
          ].map(([label, rows]) => <Box key={label} borderWidth="1px" borderRadius="lg" p={3}>
            <Text fontWeight="bold">{clubText(label)} : {rows?.length || 0}</Text>
            <Box maxH="140px" overflowY="auto">{rows?.map(row => <Text fontSize="sm" key={row.id}>{row.name}</Text>)}</Box>
          </Box>)}
          <Text fontSize="sm">{clubText('Les dossiers des clients du club, les packs, les règlements et les cours du club restent au club. Aucun client du club ne vous est transféré automatiquement.')}</Text>
          <Text fontSize="sm">{clubText('Les programmes conservés correspondent à votre bibliothèque personnelle. Les programmes enregistrés dans les dossiers des clients du club restent avec ces dossiers.')}</Text>
          <Text fontSize="sm">{clubText('Votre départ retire vos accès au club et libère votre place dans son équipe. Le club conserve un historique du départ.')}</Text>
          <Checkbox isChecked={confirmed} onChange={e => setConfirmed(e.target.checked)} isDisabled={busy}>{clubText('J’ai vérifié les éléments conservés et ceux qui restent au club.')}</Checkbox>
          {error && <><Text role="alert" color="red.500">{error}</Text><Button size="sm" onClick={load} isDisabled={busy}>{clubText('Recharger le récapitulatif')}</Button></>}
        </Stack></ModalBody>
        <ModalFooter gap={3}><Button variant="ghost" isDisabled={busy} onClick={() => setPreview(null)}>{clubText('Annuler')}</Button><Button onClick={leave} isLoading={busy} isDisabled={!confirmed}>{clubText('Quitter le club et voir les tarifs')}</Button></ModalFooter>
      </ModalContent></Modal>
  </Box>;
}
