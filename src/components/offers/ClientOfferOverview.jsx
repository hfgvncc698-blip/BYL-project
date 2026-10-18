import {useTranslation} from 'react-i18next';
import {clubText} from '../../i18n/clubText';
import { Link } from 'react-router-dom';
import { Box, Badge, Button, Heading, HStack, Stack, Text } from '@chakra-ui/react';
import { useOfferPreview } from './OfferPreviewStore';
import { useAppTheme } from '../../styles/appTheme';
export default function ClientOfferOverview({uid,clientId,programmes=[]}) {
 useTranslation();
 const [data]=useOfferPreview(uid),theme=useAppTheme();
 const contracts=data.contracts.filter(c=>c.clientId===clientId);
 return <Box {...theme.cardProps} p={4} my={4}><HStack justify="space-between" flexWrap="wrap" gap={3}><Box><Heading size="sm">{clubText("Offres et accompagnement")}</Heading><Text mt={1} fontSize="xs" color={theme.mutedText}>{programmes.length} {clubText("programme(s) attribué(s) ·")} {contracts.length} {clubText("offre(s) attribuée(s)")}</Text></Box><Button as={Link} to={`/coach/offers?tab=clients&client=${encodeURIComponent(clientId)}`} size="sm" variant="outline">{clubText("Gérer les offres")}</Button></HStack>
 {data.error&&<Text role="alert" color="red.500">{clubText(data.error)}</Text>}<Stack spacing={2} mt={3}>{contracts.map(c=><HStack key={c.id} justify="space-between" flexWrap="wrap" borderTopWidth="1px" pt={2}><Box><Text fontWeight="bold" fontSize="sm">{c.name}</Text><Text fontSize="xs" color={theme.mutedText}>{c.type==='recurring'?clubText('Abonnement · {{start}} — {{end}}',{start:c.start,end:c.end}):clubText("{{value0}}/{{value1}} séances restantes",{value0:c.remaining??c.quantity,value1:c.quantity})}</Text></Box><Badge colorScheme="teal">{c.reserved||0} {clubText("réservée(s)")}</Badge></HStack>)}</Stack>
 {!contracts.length&&<Text mt={3} fontSize="sm" color={theme.mutedText}>{clubText("Aucune offre pro attribuée. Les packs du club restent dans leur section dédiée.")}</Text>}
 {programmes.length>0&&<Text mt={3} fontSize="xs" color={theme.mutedText}>{programmes.slice(0,3).map(p=>p.nom||p.name||p.title||'Programme').join(' · ')}{programmes.length>3?'…':''}</Text>}
 </Box>;
}
