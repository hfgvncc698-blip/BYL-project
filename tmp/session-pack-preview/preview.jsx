import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChakraProvider,Box,Heading,Text,HStack,Button,Container,Badge} from '@chakra-ui/react';
import theme from '../../src/theme.js';
import '../../src/i18n/index';
import {ClubClientSessionPacks,ClientSessionPacks} from '../../src/components/dashboard/ClubSessionPacks';
import {EventFollowup} from '../../src/components/dashboard/ClubClientAdministration';
const time=Date.parse('2026-10-07T14:00:00Z');
const event={id:'absence',title:'Pilates',startsAt:time,type:'group',status:'validée',coachName:'Alex Martin',report:{attendance:'absent',response:'accepted',note:'',version:0,excuse:'Mon train a été annulé. Je n’ai pas pu rejoindre le cours à temps.'}};
const result={packs:[{id:'coaching',name:'Pack coaching · 10 séances',quantity:10,used:3,remaining:7,type:'individual',courseTitle:'',start:'2026-10-01',end:'2027-03-31',state:'active',history:[{id:'one',title:'Coaching individuel',startsAt:time-86400000,attendance:'present'}]},{id:'pilates',name:'Pack Pilates · 20 séances',quantity:20,used:6,remaining:14,type:'group',courseTitle:'Pilates',start:'2026-10-01',end:'2027-03-31',state:'active',history:[{id:'absence',title:'Pilates',startsAt:time,attendance:'absent'}]}],uncovered:[],absences:[{id:'absence',title:'Pilates',startsAt:time,attendance:'absent',excuse:event.report.excuse}]};
const request=async(path,options)=>{
 if(options?.method)throw new Error('Aperçu uniquement');
 return structuredClone(path==='/clubs/my-session-packs'?{groups:[{clubId:'demo',clientId:'demo',clubName:'Club Démo',...result}]}:result);
};
const client=new URLSearchParams(location.search).get('view')==='client';
function Preview(){return <ChakraProvider theme={theme}><Box bg="#f4f6fa" minH="100vh" pb={10}><Box bg="white" borderBottomWidth="1px" py={4} px={7}><HStack justify="space-between"><Heading size="md" color="#2c5383">Réseau BYL</Heading><Badge>Données fictives · aperçu</Badge></HStack></Box><Container maxW="960px" py={6}><HStack justify="space-between" mb={5}><Box><Heading size="lg">{client?'Mon suivi':'Léa Martin'}</Heading><Text color="gray.500">{client?'Vue client':'Vue responsable du club · Packs de séances'}</Text></Box><Button as="a" href={client?'?view=club':'?view=client'} variant="outline">{client?'Voir côté club':'Voir côté client'}</Button></HStack>{client?<ClientSessionPacks request={request}/>:<><Box bg="white" borderWidth="1px" borderRadius="2xl" p={6}><ClubClientSessionPacks clientId="demo" request={request} onReview={()=>document.getElementById('absence-review').scrollIntoView({behavior:'smooth'})}/></Box><Box id="absence-review" bg="white" borderRadius="2xl" p={6} mt={5}><Heading size="md" mb={4}>Suivi du rendez-vous</Heading><EventFollowup event={event} url="/preview" onSaved={()=>{}} request={request} draftKey="preview" openInitially/></Box></>}<Text fontSize="xs" mt={4} color="gray.500">Aperçu des composants réels, avec des exemples fictifs. Aucun enregistrement ni envoi.</Text></Container></Box></ChakraProvider>}
createRoot(document.getElementById('root')).render(<Preview/>);
