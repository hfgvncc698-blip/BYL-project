import { useTranslation } from "react-i18next";
import { clubText } from "../../i18n/clubText";
import useSessionDraft from "../../hooks/useSessionDraft";
import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Select, FormControl, FormLabel, Button, Stack, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
const openingOptions = [0, 1440, 2880, 4320, 10080, 20160, 30240, 40320];
const openingLabel = minutes => minutes === 0 ? clubText("Dès la publication du cours") : minutes < 2880 ? deadlineLabel(minutes) : clubText("{{count}} jours avant le cours", {count: minutes / 1440});
const deadlineOptions = [0, 60, 180, 360, 480, 720];
const deadlineLabel = minutes => minutes === 0 ? clubText("Jusqu’au début du cours") : minutes % 60 === 0 ? clubText("{{count}} h avant le cours", {count: minutes / 60}) : clubText("{{count}} min avant le cours", {count: minutes});

export default function ClubRegistrationSettings({ club, url, onSaved, theme, embedded = false }) {
  useTranslation();
  const [value, setValue] = useState({ mode: 'club', signupMinutes: 0, cancelMinutes: 0, openingMinutes: 0 });
  const [draft, setDraft] = useSessionDraft(club?.id ? `club-registration:${club.id}` : null, null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { setValue({ mode: 'club', signupMinutes: 0, cancelMinutes: 0, openingMinutes: 0, ...club?.groupRegistration, ...draft }); }, [club, draft]);
  const invalidWindow = value.openingMinutes > 0 && value.openingMinutes <= value.signupMinutes;
  const save = async () => {
    if (invalidWindow) return;
    setSaving(true);
    try { await apiFetch(url, { method: 'PATCH', body: JSON.stringify({ groupRegistration: value }) }); setDraft(null); await onSaved(); toast({ title: clubText("Réglages enregistrés"), status: 'success' }); }
    catch (error) { toast({ title: clubText(error?.data?.error) || clubText("Enregistrement impossible"), status: 'error' }); }
    finally { setSaving(false); }
  };
  return <Box {...(embedded ? {} : theme.cardProps)} p={embedded ? 0 : 5}>
    {!embedded && <Heading size="md" mb={2}>{clubText("Inscriptions aux cours collectifs")}</Heading>}
    <Text mb={4}>{clubText("Les membres voient les cours dans leur planning. Choisissez qui gère les inscriptions.")}</Text>
    <Stack spacing={4}>
      <FormControl><FormLabel>{clubText("Mode d’inscription par défaut")}</FormLabel><Select value={value.mode} onChange={e => setDraft({ ...value, mode: e.target.value })}>
        <option value="club">{clubText("Inscriptions gérées par le club")}</option><option value="self">{clubText("Les membres peuvent s’inscrire eux-mêmes")}</option>
      </Select></FormControl>
      {value.mode === 'self' && <>
        <Text fontSize="sm">{clubText("Une fois le cours complet, 5 places sont disponibles en liste d’attente. Une place libérée revient à la première personne en attente.")}</Text>
        <FormControl>
          <FormLabel>{clubText("Ouverture des inscriptions")}</FormLabel>
          <Select value={value.openingMinutes} onChange={e => setDraft({ ...value, openingMinutes: Number(e.target.value) })}>
            {[...new Set([...openingOptions, value.openingMinutes])].sort((a, b) => a - b).map(minutes => <option key={minutes} value={minutes}>{openingLabel(minutes)}</option>)}
          </Select>
          <Text fontSize="xs" mt={2}>{clubText("Les cours restent visibles avant l’ouverture. Les inscriptions et la liste d’attente s’ouvrent au moment choisi.")}</Text>
        </FormControl>
        {[['signupMinutes', clubText("Inscription possible jusqu’à")], ['cancelMinutes', clubText("Désinscription possible jusqu’à")]].map(([key, label]) => (
          <FormControl key={key}>
            <FormLabel>{label}</FormLabel>
            <Select value={value[key]} onChange={e => setDraft({ ...value, [key]: Number(e.target.value) })}>
              {[...new Set([...deadlineOptions, value[key]])].sort((a, b) => a - b).map(minutes => (
                <option key={minutes} value={minutes}>{deadlineLabel(minutes)}</option>
              ))}
            </Select>
          </FormControl>
        ))}
        <Text fontSize="xs">{clubText("Exemple : avec 3 h avant le cours, les inscriptions ferment à 15 h pour un cours à 18 h. Après la clôture, le club peut toujours modifier les participants.")}</Text>
      </>}
      {invalidWindow && <Text role="alert" color="red.600">{clubText("L’ouverture doit précéder la clôture des inscriptions.")}</Text>}
      <Button isDisabled={invalidWindow} {...theme.primaryButtonProps} alignSelf="flex-end" isLoading={saving} onClick={save}>{clubText("Enregistrer les inscriptions")}</Button>
    </Stack>
  </Box>;
}
