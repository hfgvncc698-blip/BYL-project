import { useTranslation } from "react-i18next";
import { clubText, clubLocale } from "../../i18n/clubText";
import React, { useState } from 'react';
import { Button, IconButton, Tooltip, Checkbox, FormControl, FormLabel, Input, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Select, Stack, Text, Alert, AlertIcon, useDisclosure } from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';
import { planningDays } from '../../utils/clubPlanningPdf.mjs';

const dateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export default function ClubPlanningDownload({ appointments, coaches, clubName, clubLogoUrl, calendarDate, selectedCoaches }) {
  useTranslation();
  const modal = useDisclosure();
  const [date, setDate] = useState(dateValue(new Date()));
  const [type, setType] = useState('group');
  const [selected, setSelected] = useState([]);
  const [paper, setPaper] = useState('a4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = { appointments, date, type, coaches: selected, coachNames: coaches, clubName, clubLogoUrl, paper, locale: clubLocale(), translate: clubText };
  const count = date ? new Set(planningDays(options).flatMap(day => day.events.map(event => event.id))).size : 0;
  const download = async () => {
    setBusy(true); setError('');
    try {
      const { createClubPlanningPdf } = await import('../../utils/clubPlanningPdf.mjs');
      const pdf = await createClubPlanningPdf(options);
      pdf.save(`planning-semaine-${date}-${type}.pdf`);
      modal.onClose();
    } catch (err) { setError(clubText(err.message) || clubText("Impossible de télécharger le planning. Réessayez.")); }
    finally { setBusy(false); }
  };
  return <>
    <Tooltip label={clubText("Télécharger le planning en PDF")} hasArrow><IconButton size="sm" variant="outline" aria-label={clubText("Télécharger le planning en PDF")} icon={<DownloadIcon />} onClick={() => { setDate(dateValue(calendarDate)); setSelected(selectedCoaches); setError(''); modal.onOpen(); }} /></Tooltip>
    <Modal isOpen={modal.isOpen} onClose={busy ? () => {} : modal.onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay /><ModalContent><ModalHeader>{clubText("Télécharger le planning")}</ModalHeader><ModalCloseButton isDisabled={busy} />
        <ModalBody><Stack spacing={4}>
          <Text fontSize="sm">{clubText("Une semaine du lundi au dimanche sur une page paysage, avec les noms, horaires et coaches. Les participants et notes privées ne sont pas imprimés.")}</Text>
          <FormControl isRequired><FormLabel>{clubText("Semaine contenant le")}</FormLabel><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></FormControl>
          <FormControl><FormLabel>{clubText("Événements à afficher")}</FormLabel><Select value={type} onChange={e => setType(e.target.value)}>
            <option value="group">{clubText("Cours collectifs uniquement")}</option><option value="all">{clubText("Tout le calendrier")}</option><option value="coaching">{clubText("Coachings individuels (sport et nutrition)")}</option>
          </Select></FormControl>
          <Stack role="group" aria-label={clubText("Professionnels")}><Text fontWeight="500">{clubText("Professionnels")}</Text><Stack maxH="180px" overflowY="auto">
            <Checkbox isChecked={!selected.length} onChange={() => setSelected([])}>{clubText("Toute l’équipe")}</Checkbox>
            {coaches.map(([id, name]) => <Checkbox key={id} isChecked={selected.includes(id)} onChange={e => setSelected(current => e.target.checked ? [...current, id] : current.filter(item => item !== id))}>{name}</Checkbox>)}
          </Stack></Stack>
          <FormControl><FormLabel>{clubText("Format d’impression")}</FormLabel><Select value={paper} onChange={e => setPaper(e.target.value)}><option value="a4">{clubText("A4 paysage")}</option><option value="a3">{clubText("A3 paysage — planning chargé")}</option></Select></FormControl>
          <Text fontSize="sm">{count} {clubText("événement(s) sélectionné(s). Les événements annulés sont exclus.")}</Text>
          {error && <Alert status="error"><AlertIcon />{error}</Alert>}
        </Stack></ModalBody>
        <ModalFooter gap={3}><Button variant="ghost" onClick={modal.onClose} isDisabled={busy}>{clubText("Fermer")}</Button><Button colorScheme="blue" onClick={download} isLoading={busy} isDisabled={!date || !count}>{clubText("Télécharger le PDF")}</Button></ModalFooter>
      </ModalContent>
    </Modal>
  </>;
}
