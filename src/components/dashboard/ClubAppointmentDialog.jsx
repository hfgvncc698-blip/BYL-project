import CalendarCancellationDetails from '../calendar/CalendarCancellationDetails';
import { calendarEventStatusKey, coachEventFormStatus, calendarEventStatusColor } from '../../utils/calendarEventAppearance.mjs';
import CalendarDifficulty from "../calendar/CalendarDifficulty";
import React from 'react';
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Text, Box, Button, Checkbox, VStack, HStack, Badge, FormControl, FormLabel, Select, Input, SimpleGrid, Textarea, Tooltip, IconButton } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';
import ClubGroupFields from './ClubGroupFields';
const APPOINTMENT_DURATIONS = [15,30,45,60,90];
export default function ClubAppointmentDialog({appointmentDetailModal, appointmentDetailLoading, appointmentDetailError, appointmentDetailRequest, openAppointmentDetail, selectedAppointment, theme, formatShortDateTime, appointmentEditForm, setAppointmentEditForm, coaches, displayName, groupClients, groupClientsLoading, groupClientsError, actionSaving, deleteAppointment, saveAppointmentEdit, lockCoach = false}) {
const {t}=useTranslation();
return (
      <Modal isOpen={appointmentDetailModal.isOpen} onClose={appointmentDetailModal.onClose} isCentered size="lg" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="22px">
          <ModalHeader>{t("clubDashboard.calendar.eventDetails", "Rendez-vous club")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {appointmentDetailLoading && <Text role="status" fontSize="sm" mb={2}>{clubText("Actualisation…")}</Text>}
            {appointmentDetailError ? <Box py={4}><Text role="alert" mb={3}>{appointmentDetailError}</Text><Button onClick={() => { appointmentDetailRequest.current = null; openAppointmentDetail(selectedAppointment); }}>{clubText("Réessayer")}</Button></Box> : <VStack as="fieldset" disabled={appointmentDetailLoading} border={0} p={0} m={0} minW={0} align="stretch" spacing={4}>
              <Box {...theme.tileProps} p={4}>
                <HStack justify="space-between" gap={3} align="start">
                  <Box minW={0}>
                    <Text fontWeight="900" noOfLines={2}>{selectedAppointment?.title || t("auto.ClubDashboard.rendez_vous", "Rendez-vous")}</Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {formatShortDateTime(selectedAppointment?.start)} · {selectedAppointment?.durationMin || 60} {clubText("min")} </Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {selectedAppointment?.coachName || t("clubDashboard.empty.noPro", "Aucun pro")}
                      {selectedAppointment?.clientName ? ` · ${selectedAppointment.clientName}` : ""}
                    </Text>
                  </Box>
                  <Badge borderRadius="full" colorScheme={calendarEventStatusColor(selectedAppointment || {})}>
                    {t(calendarEventStatusKey(selectedAppointment || {}))}
                  </Badge>
                </HStack>
                <CalendarDifficulty rating={selectedAppointment?.difficultyRating} />
                <CalendarCancellationDetails event={selectedAppointment || {}}/>
              </Box>

              {selectedAppointment?.type === "group" && (
                <>
                  <FormControl isRequired>
                    <FormLabel>{t("auto.ClubDashboard.pro_concerne", "Pro concerné")}</FormLabel>
                    <Select isDisabled={lockCoach} value={appointmentEditForm.coachUid} onChange={event => setAppointmentEditForm(current => ({ ...current, coachUid: event.target.value }))}>
                      {coaches.map(coach => <option key={coach.uid} value={coach.uid}>{displayName(coach)}</option>)}
                    </Select>
                  </FormControl>
                  <ClubGroupFields manageRegistration={!lockCoach} value={appointmentEditForm} onChange={setAppointmentEditForm} clients={groupClients} loading={groupClientsLoading} error={groupClientsError} />
                </>
              )}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.titre", "Titre")}</FormLabel>
                  <Input {...theme.inputProps} value={appointmentEditForm.title} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, title: e.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("nutritionCoach.table.status", "Statut")}</FormLabel>
                  <Select {...theme.inputProps} isDisabled={!!selectedAppointment?.excuseDecision} value={appointmentEditForm.status === selectedAppointment?.status ? coachEventFormStatus(selectedAppointment || {}) : appointmentEditForm.status} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, status: e.target.value }))}>
                    {coachEventFormStatus(selectedAppointment || {}) === 'review' && <option value="review" disabled>{t('status.to_validate')}</option>}
                    <option value="à venir">{t("status.upcoming", "À venir")}</option>
                    <option value="validée">{t("status.validated", "Validée")}</option>
                    <option value="manquée">{t("status.missed", "Manquée")}</option>
                    <option value="annulée">{t("common.cancelled", "Annulée")}</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>{t("form.datetime", "Date et heure")}</FormLabel>
                  <Input {...theme.inputProps} type="datetime-local" value={appointmentEditForm.startsAt} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, startsAt: e.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("labels.duration", "Durée")}</FormLabel>
                  <Select {...theme.inputProps} value={appointmentEditForm.durationMin} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, durationMin: Number(e.target.value) }))}>
                    {APPOINTMENT_DURATIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {clubText("{{count}} minutes", {count:minutes})}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel>{t("auto.ClubDashboard.note_interne", "Note interne")}</FormLabel>
                <Textarea {...theme.inputProps} value={appointmentEditForm.note} rows={3} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, note: e.target.value }))} />
              </FormControl>

              {selectedAppointment?.type === 'group' && <Box>
                <Checkbox isChecked={appointmentEditForm.notifyParticipants === true} onChange={e => setAppointmentEditForm(current => ({...current, notifyParticipants:e.target.checked}))}>
                  {t('calendar.notify_participants', 'Envoyer un e-mail aux inscrits concernés')}
                </Checkbox>
                <Text fontSize="xs" mt={1} color={theme.mutedText}>{t('calendar.notify_participants_hint', 'Nouvelles inscriptions, désinscriptions ou changement de créneau. Les préférences e-mail du client sont respectées.')}</Text>
              </Box>}
            </VStack>}
          </ModalBody>
          <ModalFooter gap={3}>
            <Box mr="auto">
              <Tooltip label={t("clubDashboard.calendar.deleteAppointment", "Supprimer du calendrier")}>
                <IconButton
                  aria-label={t("clubDashboard.calendar.deleteAppointment", "Supprimer du calendrier")}
                  icon={<DeleteIcon />} variant="ghost" colorScheme="red" size="sm"
                  isDisabled={appointmentDetailLoading || !!appointmentDetailError || actionSaving === `appointment:${selectedAppointment?.id}`}
                  isLoading={actionSaving === `appointment:${selectedAppointment?.id}:delete`}
                  onClick={deleteAppointment}
                />
              </Tooltip>
            </Box>
            <Button variant="ghost" onClick={appointmentDetailModal.onClose}>{t("clubDashboard.calendar.closeDetails", "Fermer")}</Button>
            <Button {...theme.primaryButtonProps} isDisabled={appointmentDetailLoading || !!appointmentDetailError} isLoading={actionSaving === `appointment:${selectedAppointment?.id}`} onClick={saveAppointmentEdit}>
              {t("programBuilder.cta.saveShort", "Enregistrer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
);
}
