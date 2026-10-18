import {useTranslation} from 'react-i18next';
import {clubText} from '../../i18n/clubText';
import {Box,Text,Button,Stack,Badge,HStack} from '@chakra-ui/react';
import {Link} from 'react-router-dom';
import {useOfferPreview} from './OfferPreviewStore';
import {offerRenewals} from '../../utils/offerRenewals';
import {offerToday} from '../../utils/coachOfferSchedule';
export default function OfferRenewalAlerts({uid}){
 useTranslation();
 const [data]=useOfferPreview(uid),alerts=offerRenewals(data.contracts,offerToday(),clubText);
 if(!alerts.length)return null;
 return <Box as="details" borderBottomWidth="1px" borderColor="blackAlpha.100" py={2} mb={2}><HStack as="summary" cursor="pointer" justify="space-between" fontSize="xs" fontWeight="bold"><Text>{clubText("Renouvellements")}</Text><Badge borderRadius="full">{alerts.length}</Badge></HStack><Stack spacing={2} mt={2}>{alerts.map(c=><Box key={c.id}><Button as={Link} to={`/coach/offers?tab=clients&client=${encodeURIComponent(c.clientId)}`} size="xs" variant="link" whiteSpace="normal" textAlign="start">{c.clientName} · {c.name}</Button><Text fontSize="xs" color="gray.500">{c.reasons.join(' · ')}</Text></Box>)}</Stack></Box>;
}
