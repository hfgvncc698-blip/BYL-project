import { useTranslation } from "react-i18next";
import { clubText, clubLocale } from "../../i18n/clubText";
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Heading, Text, Stack, HStack, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
const nameOf = p => [p.prenom || p.firstName, p.nom || p.lastName].filter(Boolean).join(' ') || p.email || clubText("Client");
export default function FormerClubClients({ urlFor, onChanged, onAdministration }) {
  useTranslation();
  const [clients, setClients] = useState([]), [error, setError] = useState(''), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(async () => { const data = await apiFetch(urlFor('/clubs/former-clients')); setClients(data.clients); setError(''); }, [urlFor]);
  useEffect(() => {
    let alive = true;
    setClients([]); setSelected(null); setError('');
    apiFetch(urlFor('/clubs/former-clients')).then(data => { if (alive) setClients(data.clients); }).catch(() => { if (alive) setError(clubText("Impossible de charger les anciens membres.")); });
    return () => { alive = false; };
  }, [urlFor]);
  const reactivate = async () => {
    setBusy(true);
    try {
      await apiFetch(urlFor(`/clubs/former-clients/${encodeURIComponent(selected.uid)}/reactivate`), { method: 'POST' });
      setSelected(null); await load(); await onChanged(); toast({ title: clubText("Adhésion réactivée"), status: 'success' });
    } catch (e) { toast({ title: clubText(e?.data?.error) || clubText("Réactivation impossible"), status: 'error' }); }
    finally { setBusy(false); }
  };
  return <Box mt={6} borderTopWidth="1px" pt={4}>
    <Heading size="sm" mb={3}>{clubText("Anciens membres")}</Heading>
    {error ? <><Text role="alert">{error}</Text><Button onClick={() => load().catch(() => {})}>{clubText("Réessayer")}</Button></> : !clients.length ? <Text fontSize="sm">{clubText("Aucun départ enregistré.")}</Text> : <Stack spacing={3}>
      {clients.map(client => <HStack key={client.uid} justify="space-between" flexWrap="wrap">
        <Box><Text color="gray.500" textDecoration="line-through">{nameOf(client.records[0]?.profile || {})}</Text><Text fontSize="sm">{client.reason === 'contract_end' ? clubText("Fin d’adhésion le") : clubText("A quitté le club le")} {new Date(client.leftAt).toLocaleDateString(clubLocale())}</Text></Box>
        <Button size="sm" variant="outline" onClick={() => setSelected(client)}>{clubText("Voir le dossier / réactiver")}</Button>
      </HStack>)}
    </Stack>}
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} size="lg" scrollBehavior="inside">
      <ModalOverlay /><ModalContent><ModalHeader>{clubText("Dossier conservé")}</ModalHeader><ModalBody><Stack spacing={3}>
        <Text>{clubText("Informations enregistrées au départ du club. Les anciens rendez-vous et programmes restent conservés ; les informations des autres clubs ne sont pas affichées.")}</Text>
        {selected?.records.map(record => <Box key={record.id} borderWidth="1px" borderRadius="lg" p={3}>
          <Text fontWeight="bold">{nameOf(record.profile)}</Text>
          {onAdministration && <Button size="sm" my={2} onClick={() => { setSelected(null); onAdministration({ id: record.id, name: nameOf(record.profile) }); }}>{clubText("Gestion confidentielle du club")}</Button>}
          {['email', 'telephone', 'dateNaissance', 'niveauSportif', 'objectifs', 'notes'].map(key => record.profile[key] ? <Text key={key} whiteSpace="pre-wrap">{({ email: 'E-mail', telephone: clubText("Téléphone"), dateNaissance: clubText("Date de naissance"), niveauSportif: clubText("Niveau sportif"), objectifs: clubText("Objectifs"), notes: clubText("Notes") })[key]} : {record.profile[key]}</Text> : null)}
        </Box>)}
        <Text fontSize="sm">{clubText("Réactivez uniquement si le client souhaite revenir. Il retrouvera l’accès avec son compte existant. Ses anciennes réservations ne seront pas rétablies. Après une fin de contrat, renseignez une nouvelle date de sortie dans son dossier.")}</Text>
      </Stack></ModalBody><ModalFooter gap={2}><Button variant="ghost" isDisabled={busy} onClick={() => setSelected(null)}>{clubText("Fermer")}</Button><Button isLoading={busy} onClick={reactivate}>{clubText("Réactiver l’adhésion")}</Button></ModalFooter></ModalContent>
    </Modal>
  </Box>;
}
