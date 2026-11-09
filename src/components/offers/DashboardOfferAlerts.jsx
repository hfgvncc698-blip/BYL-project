import { useBreakpointValue } from '@chakra-ui/react';
import { useAuth } from '../../AuthContext';
import OfferPaymentPreview from './OfferPaymentPreview';
import OfferRenewalAlerts from './OfferRenewalAlerts';

export default function DashboardOfferAlerts({ uid, layout, renewals }) {
  const visibleLayout = useBreakpointValue({ base: 'mobile', md: 'tablet', lg: 'desktop' }, { ssr: false });
  const { user } = useAuth();
  if (!uid || layout !== visibleLayout || uid !== user?.uid || user?.disabledByClub || (user?.clubId && user.role !== 'admin')) return null;
  return <>
    <OfferPaymentPreview uid={uid} compact />
    {renewals && <OfferRenewalAlerts uid={uid} />}
  </>;
}
