import { Select } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { coachEventFormStatus } from '../../utils/calendarEventAppearance.mjs';
export default function CalendarStatusSelect({ event, value, onChange }) {
  const { t } = useTranslation();
  return <Select isDisabled={coachEventFormStatus(event || {}) === 'annulée'} value={value} onChange={e => onChange(e.target.value)}>
    {value === 'review' && <option value="review" disabled>{t('status.to_validate')}</option>}
    {value === 'annulée' && <option value="annulée">{t('common.cancelled')}</option>}
    <option value="à venir">{t('status.upcoming')}</option>
    <option value="validée">{t('status.validated')}</option>
    <option value="manquée">{t('status.missed')}</option>
  </Select>;
}
