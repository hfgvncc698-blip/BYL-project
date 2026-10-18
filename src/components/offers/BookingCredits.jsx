import {useTranslation} from 'react-i18next';
import {clubText} from '../../i18n/clubText';
import {useEffect,useState,useRef} from 'react';
import {Box,Text,Select,FormControl,FormLabel,Stack} from '@chakra-ui/react';
import {apiFetch} from '../../utils/api';
export default function BookingCredits({clientId,date,type,mode,onChange,exclude}){
 useTranslation();
 const previousClient=useRef(clientId);
 useEffect(()=>{if(previousClient.current!==clientId){previousClient.current=clientId;onChange('auto');}},[clientId,onChange]);
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');if(!clientId)return;
 const params=new URLSearchParams({clientId,date:date?date.slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),service:type==='nutrition'?'nutrition':'coaching',...(exclude?{exclude}:{})});
 apiFetch(`/coach-offers/booking?${params}`).then(d=>{if(active)setData(d);}).catch(()=>{if(active)setError(clubText("Crédits indisponibles. Ils seront vérifiés lors de l’enregistrement."));});return()=>{active=false;};},[clientId,date,type,exclude]);
 if(!clientId)return null;
 if(error)return <Text role="status" fontSize="xs">{clubText(error)}</Text>;
 if(!data||data.managed===false)return null;
 const available=data?.contracts.filter(c=>!['expired','cancelled','scheduled'].includes(c.state)&&c.available>0)||[];
 return <Box width="100%" borderWidth="1px" borderRadius="lg" p={3}><FormControl><FormLabel fontSize="sm">{clubText("Prise en charge de la séance")}</FormLabel><Select size="sm" value={mode} onChange={e=>onChange(e.target.value)}><option value="auto">{clubText("Pack")}</option><option value="outside">{clubText("Séance hors pack")}</option></Select></FormControl>{mode==='outside'?<Text mt={2} fontSize="xs">{clubText("Aucun crédit ne sera réservé ou décompté. Le règlement de cette séance reste à gérer séparément.")}</Text>:<Stack mt={2} spacing={1}>{error?<Text role="status" fontSize="xs">{clubText(error)}</Text>:!date?<Text fontSize="xs">{clubText("Choisissez une date pour voir les crédits disponibles.")}</Text>:!data?<Text fontSize="xs">{clubText("Vérification des crédits…")}</Text>:!data.managed?<Text fontSize="xs">{clubText("Aucun pack pour ce type de séance : rendez-vous hors pack.")}</Text>:!available.length?<Text fontSize="xs" color="orange.600">{clubText("Aucun crédit disponible à cette date. Renouvelez le pack ou choisissez « Séance hors pack ».")}</Text>:available.map(c=><Text key={c.id} fontSize="xs">{c.name} · {c.available} {clubText("disponible(s) ·")} {c.reserved} {clubText("réservée(s)")}</Text>)}{available.length>0&&<Text fontSize="xs" color="gray.500">{clubText("Un crédit sera réservé. Le pack qui expire le plus tôt est utilisé en priorité. Pour une série, chaque date sera vérifiée.")}</Text>}</Stack>}</Box>;
}
