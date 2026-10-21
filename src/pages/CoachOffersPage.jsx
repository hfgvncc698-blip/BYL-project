import {clubText} from '../i18n/clubText';
import EditContractModal from '../components/offers/EditContractModal';
import SessionCancellationRequests from '../components/dashboard/SessionCancellationRequests';
import { activeOfferContracts } from '../utils/offerDeletion';
import { offerToday } from '../utils/coachOfferSchedule';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import PageBackButton from '../components/ui/PageBackButton';
import { AppSurface, AppSectionHeader } from '../components/ui/AppPrimitives';
import OfferClientSummary from '../components/offers/OfferClientSummary';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Badge, Button, Flex, HStack, Stack, Heading, Text, SimpleGrid, Icon, FormControl, FormLabel, Input, Select, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Tabs, TabList, Tab, TabPanels, TabPanel, Divider, Checkbox, Textarea, IconButton, AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter } from '@chakra-ui/react';
import { FiPlus, FiLayers, FiRepeat, FiCreditCard, FiCheck, FiEdit2, FiX } from 'react-icons/fi';
import { useAuth } from '../AuthContext';
import { hasPlanModule } from '../utils/proPlanAccess';
import currencies from '../../backend/utils/clubCurrencies.json';
import { currencyScale, amountUnits } from '../utils/clubMoney';
import OfferClientCard from '../components/offers/OfferClientCard';
import AssignOfferModal from '../components/offers/AssignOfferModal';
import OfferPaymentPreview from '../components/offers/OfferPaymentPreview';
import { useOfferPreview } from '../components/offers/OfferPreviewStore';
import { useAppTheme } from '../styles/appTheme';

const copy = {
    title:'Offres et paiements', back:'Tableau de bord', eyebrow:'MON ACTIVITÉ', intro:'Des offres à votre image. Un suivi simple, du premier rendez-vous au renouvellement.', preview:'Aperçu interactif', notice:'Les offres attribuées sont enregistrées dans votre compte. Les séances de coaching du planning mettent automatiquement à jour les crédits.', create:'Créer une offre', offers:'Mes offres', clients:'Suivi clients', payments:'Paiements', catalogue:'Votre catalogue', catalogueText:'Séances, packs ou accompagnements mensuels : composez votre façon de travailler.', all:'Toutes les offres', single:'À la séance', pack:'Pack de séances', recurring:'Abonnement', edit:'Modifier', perMonth:'/ mois', once:'paiement unique', sessions:'séances', session:'séance', valid:'Validité', months:'mois', noExpiry:'Sans expiration', active:'Exemple', draft:'Brouillon', service:'Accompagnement', coaching:'Coaching', nutrition:'Nutrition', mixed:'Sport & nutrition', detail:'Détail de l’offre', name:'Nom de l’offre', type:'Format', price:'Prix (€)', quantity:'Séances incluses', duration:'Validité (mois)', cancel:'Annuler', save:'Enregistrer', included:'Inclus dans l’offre', support:'Suivi entre les rendez-vous', example:'Exemple', samplePack:'Coaching · 10 séances', sampleSingle:'Bilan nutrition', sampleMonthly:'Accompagnement complet', packText:'Un cap, dix rendez-vous pour avancer.', singleText:'Un premier bilan pour poser les bonnes bases.', monthlyText:'Sport et nutrition, avec un rendez-vous régulier.', createdText:'Votre nouvelle offre, prête à être affinée.', catalogueCount:'offres dans le catalogue', formats:'formats pour votre activité', clientTitle:'Chaque accompagnement, en un regard', clientText:'Un aperçu du suivi : crédits restants, renouvellements et échéances.', personA:'Client exemple A', personB:'Client exemple B', personC:'Client exemple C', remaining:'séances restantes', used:'séances réalisées', renew:'À renouveler', ongoing:'En cours', next:'Prochaine échéance', clientHint:'Les rendez-vous réservent les crédits. Les séances validées ou marquées manquées les décomptent ; les annulations les libèrent.', paymentTitle:'Les règlements à vérifier', paymentText:'À la date prévue, un rappel apparaît sur le dashboard. Confirmez si le paiement effectué hors du site a été reçu.', received:'Encaissé · exemple', upcoming:'À venir · exemple', paymentSetup:'Encaissement en ligne', notConnected:'À configurer', setupText:'Le paiement par carte et le prélèvement SEPA seront raccordés après validation de cette présentation.', monthly:'Mensuel', paid:'Réglé', planned:'Prévu', date:'Échéance', empty:'Aucune offre dans ce format.', exampleDate:'5 novembre', examplePaidDate:'12 octobre', offerCount:'offres', formatCount:'Séance · Pack · Abonnement', previewSummary:'Votre catalogue en un clin d’œil', previewAction:'Personnalisez votre catalogue',
  };
const icons = { single: FiCreditCard, pack: FiLayers, recurring: FiRepeat };
const colors = { single: 'teal', pack: 'blue', recurring: 'purple' };
const seed = [
  { id:'pack', titleKey:'samplePack', descriptionKey:'packText', type:'pack', service:'coaching', price:550, quantity:10, months:6 },
  { id:'single', titleKey:'sampleSingle', descriptionKey:'singleText', type:'single', service:'nutrition', price:70, quantity:1, months:0 },
  { id:'recurring', titleKey:'sampleMonthly', descriptionKey:'monthlyText', type:'recurring', service:'mixed', price:180, quantity:2, months:0 },
];

export default function CoachOffersPage() {
  const [searchParams,setSearchParams]=useSearchParams();
  const selectedClientId=searchParams.get('client');
  const { i18n } = useTranslation();
  const c = Object.fromEntries(Object.entries(copy).map(([key,text])=>[key,clubText(text)]));
  const theme = useAppTheme();
  const [offers,setOffers] = useState(seed);
  const { user } = useAuth();
  const defaultService = hasPlanModule(user, 'nutrition') && !hasPlanModule(user, 'sport') ? 'nutrition' : 'coaching';
  const [contractFilter,setContractFilter] = useState(null);
  const [editingContract,setEditingContract]=useState(null);
  const [summaryClient,setSummaryClient] = useState(null);
  const [assignment,setAssignment] = useState(null);
  const [preview,updatePreview] = useOfferPreview(user?.uid);
  const [catalogueError,setCatalogueError]=useState('');
  const [policySaving,setPolicySaving]=useState(false);
  const [showCancellationHistory,setShowCancellationHistory]=useState(false);
  const [clientSearch,setClientSearch]=useState('');
  useEffect(()=>{setOffers(preview.offers || seed);},[user?.uid,preview.offers]);
  const serializeOffer=o=>({...o,name:o.name||c[o.titleKey],description:o.description??c[o.descriptionKey]??'',currency:o.currency||'EUR'});
  const persistOffers=async next=>{try{await updatePreview(s=>({...s,offers:next.map(serializeOffer),contracts:s.contracts.map(contract=>{if(contract.offerId)return contract;const source=offers.find(o=>(o.titleKey&&o.titleKey===contract.titleKey)||(o.type===contract.type&&o.name===contract.name));return source?{...contract,offerId:source.id}:contract;})}));setOffers(next);setCatalogueError('');return true;}catch{setCatalogueError(clubText("Enregistrement impossible. Vérifiez la connexion au serveur."));return false;}};
  const [filter,setFilter] = useState('all');
  const [deleting,setDeleting]=useState(null);
  const cancelDeleteRef=useRef(null);
  const blockingContracts=deleting?activeOfferContracts({...deleting,name:deleting.name||c[deleting.titleKey]},preview.contracts,offerToday()):[];
  const removeOffer=async()=>{if(!deleting||blockingContracts.length)return;try{await updatePreview(state=>{if(activeOfferContracts({...deleting,name:deleting.name||c[deleting.titleKey]},state.contracts,offerToday()).length)throw new Error('active');return {...state,offers:(state.offers||offers).filter(o=>o.id!==deleting.id).map(serializeOffer)};});setDeleting(null);}catch{setCatalogueError(clubText("Suppression impossible. Vérifiez les attributions actives."));}};
  const [editing,setEditing] = useState(null);
  const [saving,setSaving]=useState(false);
  const [tab,setTab] = useState(()=>new URLSearchParams(window.location.search).get('tab')==='payments'?2:new URLSearchParams(window.location.search).get('tab')==='clients'?1:0);
  const money = (value,currency='EUR') => new Intl.NumberFormat(i18n.language || 'fr', {style:'currency',currency}).format(value);
  const title = offer => offer.name || c[offer.titleKey];
  const open = offer => setEditing(offer ? {...offer,name:title(offer),description:offer.description??c[offer.descriptionKey]??'',isNew:false} : {id:crypto.randomUUID(), name:'',type:'pack',service:defaultService,price:0,currency:'EUR',prorata:true,quantity:10,months:6,description:'',isNew:true});
  const patch = data => setEditing(current => ({...current,...data}));
  const save = async event => {
    event.preventDefault();
    if (!editing.name.trim() || !Number.isFinite(Number(editing.price)) || Number(editing.price)<0 || amountUnits(editing.price,editing.currency||'EUR')===null || !Number.isInteger(Number(editing.quantity)) || Number(editing.quantity)<1 || Number(editing.quantity)>999 || !Number.isInteger(Number(editing.months)) || Number(editing.months)<0 || Number(editing.months)>120) return;
    const next = {...editing,name:editing.name.trim(),price:Number(editing.price),quantity:editing.type==='single'?1:Number(editing.quantity),months:Number(editing.months),description:(editing.description||'').trim(),draft:false,isNew:false};
    if(saving)return;setSaving(true);
    const saved=await persistOffers(offers.some(item=>item.id===next.id) ? offers.map(item=>item.id===next.id?next:item) : [...offers,next]);
    setSaving(false);if(!saved)return;
    setEditing(null);setTab(0);setFilter('all');
  };
  // Reverse insertion order also keeps the latest legacy entries first when dates are absent or equal.
  const recentContracts=[...preview.contracts].reverse().sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
  const visibleOffers=offers.filter(o=>filter==='all'||o.type===filter);
  const tile = {...theme.cardProps,p:{base:4,md:6}};
  return <Box bg={theme.pageBg} color={theme.textColor} minH="100vh" px={{base:3,md:6}} pt={5} pb={{base:28,md:10}}>
    <Stack maxW="1200px" mx="auto" spacing={5}>
      <AppSurface p={{base:4,md:5}}>
        <Flex align="flex-start" gap={3}>
          <PageBackButton fallbackTo="/coach-dashboard"/>
          <AppSectionHeader flex="1" headingAs="h1" title={c.title} subtitle={c.intro} action={<Button {...theme.primaryButtonProps} leftIcon={<FiPlus/>} onClick={()=>open()}>{c.create}</Button>} direction={{base:'column',lg:'row'}} align={{base:'stretch',lg:'center'}}/>
        </Flex>
      </AppSurface>
      <Text fontSize="xs" color={theme.mutedText} px={2}>{c.notice}</Text>{preview.error&&<Text role="alert" color="red.500">{clubText(preview.error)}</Text>}{preview.loading&&<Text fontSize="sm">{clubText("Chargement des offres…")}</Text>}
      <Tabs index={tab} onChange={index=>{setTab(index);setContractFilter(null);}} variant="unstyled" isLazy>
        <TabList gap={1} bg={theme.surfaceBgStrong} borderWidth="1px" borderColor={theme.borderColor} p={1} borderRadius="full" w={{base:'100%',md:'fit-content'}} mb={6}>
          {['offers','clients','payments'].map(key=><Tab key={key} flex={{base:1,md:'initial'}} minH="42px" px={{base:3,md:6}} fontSize="sm" fontWeight="700" borderRadius="full" _selected={{bg:'#111827',color:'white',_dark:{bg:'white',color:'#111827'}}}>{c[key]}</Tab>)}
        </TabList>
        {selectedClientId&&<HStack mb={4} flexWrap="wrap"><Button as={RouterLink} to={`/clients/${encodeURIComponent(selectedClientId)}`} size="sm" variant="outline">{clubText("Retour à la fiche client")}</Button><Button size="sm" variant="ghost" onClick={()=>{setSearchParams({tab:'clients'});setContractFilter(null);}}>{clubText("Voir tous les clients")}</Button><Text fontSize="xs">{clubText("Offres et paiements filtrés pour ce client")}</Text></HStack>}
        <TabPanels>
          <TabPanel p={0}>
            <Flex justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap"><Box><Heading size="md">{c.catalogue}</Heading><Text color={theme.mutedText} fontSize="sm" mt={1}>{c.catalogueText}</Text></Box><Select aria-label={c.type} value={filter} onChange={e=>setFilter(e.target.value)} w={{base:'100%',md:'190px'}} bg={theme.surfaceBgStrong} borderRadius="full"><option value="all">{c.all}</option>{['single','pack','recurring'].map(key=><option key={key} value={key}>{c[key]}</option>)}</Select></Flex>{catalogueError&&<Text role="alert" color="red.500">{clubText(catalogueError)}</Text>}
            <SimpleGrid columns={{base:1,md:2,lg:3}} spacing={4}>
              {visibleOffers.map(offer=><Box {...tile} key={offer.id} display="flex" flexDirection="column" borderTopWidth="3px" borderTopColor={`${colors[offer.type]}.400`}>
                <HStack justify="space-between" mb={5}><HStack><Box p={2.5} borderRadius="14px" bg={theme.surfaceSoft}><Icon as={icons[offer.type]} boxSize={5} color={`${colors[offer.type]}.400`}/></Box><Text fontSize="sm" fontWeight="700">{c[offer.type]}</Text></HStack><HStack><Badge colorScheme={offer.draft?'gray':colors[offer.type]} borderRadius="full" px={2}>{offer.archived?clubText("Archivée"):seed.some(s=>s.id===offer.id)&&!offer.name?c.example:clubText("Enregistrée")}</Badge><IconButton size="xs" variant="ghost" aria-label={`Supprimer ${title(offer)}`} icon={<FiX/>} onClick={()=>setDeleting(offer)}/></HStack></HStack>
                <Heading size="md">{title(offer)}</Heading><Text fontSize="sm" color={theme.mutedText} mt={2} minH="42px">{offer.description??c[offer.descriptionKey]??''}</Text>
                <HStack mt={5} mb={5} align="baseline"><Text fontSize="36px" lineHeight="1" fontWeight="800" letterSpacing="-.04em">{money(offer.price,offer.currency)}</Text><Text color={theme.mutedText} fontSize="sm">{offer.type==='recurring'?c.perMonth:c.once}</Text></HStack>
                <Divider mb={4}/><Stack spacing={3} flex={1} mb={6}>{[c[offer.service],`${offer.quantity} ${offer.quantity===1?c.session:c.sessions}${offer.type==='recurring'?` ${c.perMonth}`:''}`,offer.type==='recurring'?c.support:offer.months?`${c.valid} · ${offer.months} ${c.months}`:c.noExpiry].map(line=><HStack key={line} align="start"><Icon as={FiCheck} color="teal.500" mt={1}/><Text fontSize="sm">{line}</Text></HStack>)}</Stack>
                <Button mb={2} isDisabled={preview.loading||!!preview.error} {...theme.primaryButtonProps} onClick={()=>setAssignment({...offer,name:title(offer),description:offer.description??c[offer.descriptionKey]??'',isNew:false})}>{clubText("Attribuer à un client")}</Button>
                <Button variant="outline" borderRadius="full" leftIcon={<FiEdit2/>} onClick={()=>open(offer)}>{c.edit}</Button>
              </Box>)}
            </SimpleGrid>
            {!visibleOffers.length&&<Text p={6}>{c.empty}</Text>}
            <Flex mt={5} p={4} borderRadius="18px" bg={theme.surfaceSoft} justify="space-between" align="center" gap={3} flexWrap="wrap"><Text color={theme.mutedText} fontSize="sm"><Box as="span" color={theme.textColor} fontWeight="800">{offers.length}</Box> {c.catalogueCount} · {c.formatCount}</Text><Text fontSize="sm" color={theme.mutedText}>{c.previewAction}</Text></Flex>
          </TabPanel>
          <TabPanel p={0}><Heading size="md">{c.clientTitle}</Heading>{selectedClientId&&!preview.contracts.some(c=>c.clientId===selectedClientId)&&<Button mt={3} size="sm" onClick={()=>setTab(0)}>{clubText("Choisir une offre à attribuer")}</Button>}<Text mt={2} mb={5} color={theme.mutedText}>{c.clientText}</Text>
            <HStack mb={3} spacing={3} flexWrap="wrap"><FormControl width="auto"><FormLabel fontSize="xs" mb={1}>{clubText("Annulation sans décompte jusqu’à")}</FormLabel><Select size="sm" width="auto" value={preview.cancellationMinutes||0} isDisabled={policySaving||preview.loading} onChange={async e=>{setPolicySaving(true);try{await updatePreview({action:'policy',cancellationMinutes:Number(e.target.value)});setCatalogueError('');}catch(e){setCatalogueError(e.data?.error||clubText("Enregistrement impossible."));}finally{setPolicySaving(false);}}}>{[[0,'L’heure du rendez-vous'],[60,'1 heure avant'],[120,'2 heures avant'],[1440,'24 heures avant'],[2880,'48 heures avant']].map(([value,label])=><option key={value} value={value}>{clubText(label)}</option>)}</Select></FormControl><Button size="xs" variant="ghost" onClick={()=>setShowCancellationHistory(v=>!v)}>{showCancellationHistory?'Masquer l’historique des annulations':'Historique des annulations'}</Button></HStack><SessionCancellationRequests history={showCancellationHistory}/><Input mb={4} placeholder="Rechercher un client ou une offre" aria-label="Rechercher un client ou une offre" value={clientSearch} onChange={e=>setClientSearch(e.target.value)}/><Stack mb={5} spacing={2}>{recentContracts.filter(contract=>(!selectedClientId||contract.clientId===selectedClientId)&&`${contract.clientName} ${contract.name}`.toLocaleLowerCase().includes(clientSearch.toLocaleLowerCase())).map(contract=><OfferClientCard key={contract.id} contract={contract} checks={preview.checks} money={money} onEdit={()=>setEditingContract(contract)} onSummary={()=>setSummaryClient(contract)} onOpen={()=>{setContractFilter(contract.id);setTab(2);}}/>)}</Stack>
            <Text mt={5} fontSize="sm" color={theme.mutedText}>{c.clientHint}</Text>
          </TabPanel>
          <TabPanel p={0}><Heading size="md">{c.paymentTitle}</Heading><Text mt={2} mb={5} color={theme.mutedText}>{c.paymentText}</Text>
            <OfferPaymentPreview uid={user?.uid} clientId={selectedClientId} contractId={contractFilter} onClearFilter={()=>setContractFilter(null)}/>

          </TabPanel>
        </TabPanels>
      </Tabs>
    </Stack>
    <AlertDialog isOpen={!!deleting} leastDestructiveRef={cancelDeleteRef} onClose={()=>setDeleting(null)} isCentered><AlertDialogOverlay><AlertDialogContent mx={3}><AlertDialogHeader>{clubText("Supprimer du catalogue")}</AlertDialogHeader><AlertDialogBody><Text fontWeight="bold" mb={2}>{deleting&&title(deleting)}</Text>{blockingContracts.length?<><Text>{clubText("Cette offre est encore attribuée à")} {blockingContracts.length} {clubText("client(s). Vous pourrez la supprimer lorsque les abonnements seront terminés ou les séances épuisées.")}</Text><Stack mt={3}>{[...new Set(blockingContracts.map(c=>c.clientName))].map(name=><Text key={name} fontSize="sm">{name}</Text>)}</Stack></>:<Text>{clubText("Êtes-vous sûr de vouloir supprimer")} {deleting?.type==='recurring'?clubText("cet abonnement"):clubText("cette offre")} {clubText("de votre catalogue ? L’historique des clients sera conservé.")}</Text>}{catalogueError&&<Text role="alert" color="red.500" mt={2}>{clubText(catalogueError)}</Text>}</AlertDialogBody><AlertDialogFooter gap={2}><Button ref={cancelDeleteRef} variant="ghost" onClick={()=>setDeleting(null)}>{clubText("Annuler")}</Button><Button colorScheme="red" isDisabled={!!blockingContracts.length} onClick={removeOffer}>{clubText("Supprimer")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialogOverlay></AlertDialog>
    {editingContract&&<EditContractModal uid={user?.uid} contract={editingContract} onClose={()=>setEditingContract(null)}/>}
    {summaryClient&&<OfferClientSummary uid={user?.uid} client={summaryClient} onClose={()=>setSummaryClient(null)}/>}
    {assignment&&<AssignOfferModal initialClientId={selectedClientId} offer={assignment} uid={user?.uid} onClose={()=>setAssignment(null)} onAssigned={()=>{setAssignment(null);setTab(1);}}/>}
    <Modal isOpen={!!editing} onClose={()=>setEditing(null)} isCentered scrollBehavior="inside" size="lg"><ModalOverlay/><ModalContent mx={3} bg={theme.surfaceBgStrong} borderRadius="24px" maxH="calc(100dvh - 48px)"><Box as="form" onSubmit={save} display="flex" flexDirection="column" minH={0} maxH="inherit"><ModalHeader>{editing?.isNew?c.create:c.detail}</ModalHeader><ModalCloseButton/><ModalBody overflowY="auto"><Stack spacing={4}>
      <Text fontSize="xs" color={theme.mutedText}>{c.notice}</Text>
      <FormControl isRequired><FormLabel>{c.name}</FormLabel><Input value={editing?.name||''} maxLength={100} onChange={e=>patch({name:e.target.value})}/></FormControl>
      <FormControl><FormLabel>{clubText("Description")}</FormLabel><Textarea rows={3} maxLength={1000} value={editing?.description||''} onChange={e=>patch({description:e.target.value})}/></FormControl>
      <SimpleGrid columns={{base:1,sm:2}} spacing={4}><FormControl><FormLabel>{c.type}</FormLabel><Select value={editing?.type||'pack'} onChange={e=>patch({type:e.target.value,quantity:e.target.value==='single'?1:editing.quantity})}>{['single','pack','recurring'].map(key=><option key={key} value={key}>{c[key]}</option>)}</Select></FormControl><FormControl><FormLabel>{c.service}</FormLabel><Select value={editing?.service||'coaching'} onChange={e=>patch({service:e.target.value})}>{['coaching','nutrition','mixed'].map(key=><option key={key} value={key}>{c[key]}</option>)}</Select></FormControl><FormControl isRequired><FormLabel htmlFor="offer-price">{c.price.replace(/ \(.*\)/,'')}</FormLabel><HStack spacing={2}><Input id="offer-price" minW={0} type="number" min="0" step={1/currencyScale(editing?.currency)} value={editing?.price??''} onChange={e=>patch({price:e.target.value})}/><Select id="offer-currency" aria-label={({fr:clubText("Devise"),en:'Currency',es:'Moneda',it:'Valuta',de:'Währung',ru:'Валюта',ar:'العملة'})[(i18n.resolvedLanguage||i18n.language||'fr').split('-')[0]]||'Currency'} w="88px" minW="88px" flexShrink={0} fontSize="sm" value={editing?.currency||'EUR'} onChange={e=>patch({currency:e.target.value})}>{currencies.map(code=><option key={code} value={code} title={new Intl.DisplayNames([i18n.language||'fr'],{type:'currency'}).of(code)}>{code}</option>)}</Select></HStack></FormControl><FormControl isRequired><FormLabel>{c.quantity}</FormLabel><Input type="number" min="1" max="999" step="1" isDisabled={editing?.type==='single'} value={editing?.quantity??1} onChange={e=>patch({quantity:e.target.value})}/></FormControl></SimpleGrid>
      {editing?.type==='recurring'&&<Checkbox isChecked={editing.prorata!==false} onChange={e=>patch({prorata:e.target.checked})}>{clubText("Prorata du premier règlement par défaut")}</Checkbox>}
      {editing?.type!=='recurring'&&<FormControl><FormLabel>{c.duration}</FormLabel><Select value={editing?.months||0} onChange={e=>patch({months:Number(e.target.value)})}><option value={0}>{c.noExpiry}</option>{[...new Set([1,3,6,12,...(Number(editing?.months)>0?[Number(editing.months)]:[])])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} {c.months}</option>)}</Select></FormControl>}
    </Stack></ModalBody><ModalFooter gap={2} flexWrap="wrap"><Button variant="ghost" onClick={()=>setEditing(null)}>{c.cancel}</Button><Button type="submit" isLoading={saving} {...theme.primaryButtonProps}>{c.save}</Button></ModalFooter></Box></ModalContent></Modal>
  </Box>;
}
