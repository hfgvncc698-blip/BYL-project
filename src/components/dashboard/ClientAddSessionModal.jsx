import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, VStack, FormControl, FormLabel, Select, Input, Button } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import CalendarRecurrenceFields from '../calendar/CalendarRecurrenceFields';
import { expandRecurringDates } from '../../utils/calendarRecurrence';

export default function ClientAddSessionModal({ onClose, newSession, setNewSession, programmes, getProgrammeDisplayName, handleAddSession, sessionCreateSaving }) {
  const { t } = useTranslation();
  return (
      <Modal isOpen onClose={onClose} isCentered>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>{t('calendar.add_session')}</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>{t('calendar.program')}</FormLabel>
                <Select
                  placeholder={t('calendar.select_program')}
                  value={newSession.programmeId}
                  onChange={e=>setNewSession(prev=>({...prev,programmeId:e.target.value,sessionIndex:null}))}
                >
                  {programmes.map(p=><option key={p.id} value={p.id}>{getProgrammeDisplayName(p)}</option>)}
                </Select>
              </FormControl>
              {newSession.programmeId && (
                <FormControl isRequired>
                  <FormLabel>{t('calendar.session')}</FormLabel>
                  <Select
                    placeholder={t('calendar.select_session')}
                    value={newSession.sessionIndex ?? ''}
                    onChange={e=>setNewSession(prev=>({...prev,sessionIndex: Number(e.target.value)}))}
                  >
                    {programmes.find(p=>p.id===newSession.programmeId)?.sessions?.map((s,i)=>
                      <option key={i} value={i}>{s.title || s.name || t('client_dash.session_n', { n: i+1 })}</option>
                    )}
                  </Select>
                </FormControl>
              )}
              <FormControl isRequired>
                <FormLabel>{t('calendar.start_datetime')}</FormLabel>
                <Input
                  type="datetime-local"
                  value={newSession.startDateTime}
                  onChange={e=>setNewSession(prev=>({...prev,startDateTime:e.target.value}))}
                />
              </FormControl>
              <CalendarRecurrenceFields
                value={newSession.recurrence}
                onChange={(recurrence) => setNewSession((prev) => ({ ...prev, recurrence }))}
                startDateTime={newSession.startDateTime}
                t={t}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>{t('actions.close')}</Button>
            <Button
              onClick={handleAddSession}
              isLoading={sessionCreateSaving}
              loadingText={t('common.saving', 'Enregistrement…')}
              isDisabled={expandRecurringDates(newSession.startDateTime, newSession.recurrence).length === 0}
            >
              {t('actions.add')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
  );
}
