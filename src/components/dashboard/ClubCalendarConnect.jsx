import { useState } from 'react';
import { Button, IconButton, Input, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Text, Tooltip, VStack, useDisclosure } from '@chakra-ui/react';
import { LinkIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';

export default function ClubCalendarConnect({ clubId }) {
  const { t } = useTranslation();
  const modal = useDisclosure();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = t('dashboard.connect_calendar', 'Connecter le calendrier');
  const generate = async () => {
    setBusy(true); setError('');
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const result = await httpsCallable(getFunctions(undefined, 'europe-west1'), 'ensureClubCalendarSubscription')({
        clubId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setUrl(result.data.url);
      try { await navigator.clipboard.writeText(result.data.url); } catch { /* The visible link remains selectable. */ }
    } catch {
      setError(t('dashboard.toasts.calendar_link_generate_error_desc', 'Impossible de générer le lien du calendrier.'));
    } finally { setBusy(false); }
  };
  return <>
    <Tooltip label={label}><IconButton aria-label={label} icon={<LinkIcon />} size="sm" variant="outline" borderRadius="14px" onClick={modal.onOpen} isDisabled={!clubId}/></Tooltip>
    <Modal isOpen={modal.isOpen} onClose={modal.onClose} isCentered>
      <ModalOverlay/><ModalContent borderRadius="22px">
        <ModalHeader>{label}</ModalHeader><ModalCloseButton/>
        <ModalBody><VStack align="stretch" spacing={3}>
          <Text fontSize="sm">{t('dashboard.calendar_link_modal.description', 'Copiez ce lien d’abonnement pour synchroniser les séances dans votre agenda externe.')}</Text>
          {error && <Text role="alert" color="red.500">{error}</Text>}
          <Button onClick={generate} isLoading={busy}>{t('dashboard.calendar_link_modal.generate_copy', 'Générer et copier le lien')}</Button>
          {url && <Input aria-label={t('dashboard.calendar_link_modal.subscription_link_label', 'Lien d’abonnement')} value={url} readOnly onFocus={e=>e.target.select()}/>}
        </VStack></ModalBody>
        <ModalFooter gap={3}>
          <Button isDisabled={!url} onClick={async()=>{try{await navigator.clipboard.writeText(url);}catch{setError(t('common.error','Erreur'));}}}>{t('common.copy','Copier')}</Button>
          <Button variant="ghost" onClick={modal.onClose}>{t('clubDashboard.calendar.closeDetails','Fermer')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  </>;
}
