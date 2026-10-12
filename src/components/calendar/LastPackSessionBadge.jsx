import { Badge } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
export default function LastPackSessionBadge({ reserved = false }) {
  const { t } = useTranslation();
  return <Badge colorScheme="orange" borderRadius="md" px={2} py={1} whiteSpace="normal">
    {reserved ? t('calendar.last_pack_reserved', 'Votre dernière séance est réservée') : t('calendar.last_pack_session', 'Dernière séance du pack')}
  </Badge>;
}
