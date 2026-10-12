import ClubParticipantPacks from './ClubParticipantPacks';
import { clubText } from "../../i18n/clubText";
import React, { useState } from "react";
import { Box, Select, Checkbox, FormControl, FormLabel, Input, Text, VStack, HStack, Badge } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export default function ClubGroupFields({ value, onChange, clients, loading, error, manageParticipants = true, manageRegistration = true }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const ids = value.participantIds || [];
  const waiting = value.waitlistIds || [];
  const reservations = [...ids, ...waiting];
  const updateReservations = (next, capacity = value.capacity) => {
    const places = Math.max(0, Number(capacity) || 0);
    onChange({ ...value, capacity, participantIds: next.slice(0, places), waitlistIds: next.slice(places) });
  };
  const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = clients.filter(client => normalize(client.name).includes(normalize(search)));
  return (
    <Box borderWidth="1px" borderRadius="16px" p={4} w="full">
      <FormControl mb={3}><FormLabel>{clubText("Inscriptions à ce cours")}</FormLabel>
        <Select isDisabled={!manageRegistration} value={value.registrationMode || 'inherit'} onChange={e => onChange(current => ({ ...current, registrationMode: e.target.value }))}>
          <option value="inherit">{clubText("Réglage du club")}</option><option value="club">{clubText("Gérées par le club")}</option><option value="self">{clubText("Inscriptions autonomes")}</option>
        </Select>
      </FormControl>
      <FormControl isRequired>
        <FormLabel>{t("clubDashboard.group.capacity", "Nombre de places")}</FormLabel>
        <Input type="number" min={1} max={500} value={value.capacity ?? 10}
          onChange={event => updateReservations(reservations, event.target.value)} />
      </FormControl>
      {!manageParticipants ? <Text mt={3} fontSize="sm">{t("clubDashboard.group.registerLater", "Créez le cours, puis ouvrez une séance dans le calendrier pour inscrire ses participants. Chaque séance dispose de 5 places en liste d’attente.")}</Text> : <>
      <HStack justify="space-between" my={3}>
        <Text fontWeight="700">{t("clubDashboard.group.participants", "Participants")}</Text>
        <Badge>{ids.length} / {value.capacity || 0}</Badge>
      </HStack>
      <Text fontSize="sm" mb={3}>{t("clubDashboard.group.waitingCount", { defaultValue: "Liste d’attente : {{count}} / 5 · La première personne est inscrite automatiquement lorsqu’une place se libère.", count: waiting.length })}</Text>
      <VStack align="stretch" spacing={1} mb={3}>
        {waiting.map((id, index) => <Text fontSize="sm" key={id}>{index + 1}. {clients.find(client => client.id === id)?.name || id}<ClubParticipantPacks client={clients.find(client => client.id === id)} event={value}/></Text>)}
      </VStack>
      <Input type="search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder={t("clientsList.searchPlaceholder", "Rechercher un client")}
        aria-label={t("clientsList.searchPlaceholder", "Rechercher un client")} mb={3} />
      {loading ? <Text>{t("common.loading", "Chargement…")}</Text> : error ? <Text role="alert" color="red.400">{error}</Text> : (
        <VStack align="stretch" maxH="180px" overflowY="auto" spacing={2}>
          {visible.map(client => <Checkbox key={client.id} isChecked={reservations.includes(client.id)}
            isDisabled={!reservations.includes(client.id) && reservations.length >= Number(value.capacity) + 5}
            onChange={event => updateReservations(event.target.checked ? [...reservations, client.id] : reservations.filter(id => id !== client.id))}>
            {client.name}<ClubParticipantPacks client={client} event={value}/>{waiting.includes(client.id) && <Badge ml={2}>{t("clubDashboard.group.waiting", "En attente")}</Badge>}
          </Checkbox>)}
          {!visible.length && <Text fontSize="sm">{t("clubDashboard.search.empty", "Aucun résultat ne correspond à votre recherche.")}</Text>}
        </VStack>
      )}
      {waiting.length > 5 && <Text role="alert" color="red.400" mt={2}>{t("clubDashboard.group.overCapacity", "Retirez des participants ou augmentez le nombre de places.")}</Text>}
      </>}
    </Box>
  );
}
