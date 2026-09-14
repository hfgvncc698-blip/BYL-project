import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button as ThemeButton, Flex, Heading, Text, Stack, Select, Input, Badge, Progress, SimpleGrid, FormControl, FormLabel, useToast, useColorModeValue } from '@chakra-ui/react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { reorderTrainingCycles } from '../../utils/reorderTrainingCycles';
import { coachCycleHistory, cycleDisplayNumbers } from '../../utils/coachCycleHistory';
import useCenteredCycle from '../../hooks/useCenteredCycle';
import { doc, runTransaction, collection, getDocsFromServer } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../../firebaseConfig';
import { CYCLE_TYPES, cycleTimeline, suggestedCycles, continuingCyclePlan, displayedCyclePlan, writeCyclePlan, cycleDraft, formatCycleDate, syncCycleDurations, nextCycleSession } from '../../utils/trainingCycles';
import CycleSessionList from './CycleSessionList';
import CyclePreparationNotice from './CyclePreparationNotice';
import { cycleSourceId } from '../../utils/cyclePreviews';
import { varyCycleExercises } from '../../utils/cycleVariation';
import { programClientName } from '../../utils/programLibrary';
import { getProgramPlannedSessionTotal, getProgramValidatedSessionCount } from '../../utils/programDuration';
import { cycleTranslations } from '../../i18n/cycleTranslations';

const labels = { hypertrophy: 'Hypertrophie', general: 'Préparation générale', endurance: 'Endurance musculaire', strength: 'Force', recovery: 'Récupération', custom: 'Personnalisée' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const newId = () => crypto.randomUUID();
const Button = props => <ThemeButton size="sm" borderRadius="full" variant="outline" maxW="100%" whiteSpace="normal" height="auto" minH="36px" py={2} {...props} />;

export default function TrainingCycles({ clientId, client, programmes, programmesReady, coachId }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'fr';
  const dateText = value => formatCycleDate(value, locale);
  const tx = (key, fallback) => cycleTranslations[(i18n.resolvedLanguage || i18n.language).split('-')[0]]?.[key] || fallback;
  const navigate = useNavigate();
  const toast = useToast();
  const surface = useColorModeValue('white', 'gray.900');
  const soft = useColorModeValue('blue.50', 'whiteAlpha.50');
  const muted = useColorModeValue('gray.600', 'gray.400');
  const outline = useColorModeValue('gray.200', 'whiteAlpha.200');
  const secondaryButtonBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const secondaryButtonHover = useColorModeValue('gray.200', 'whiteAlpha.200');
  const [suggestion] = useState(() => ({ start: today(), cycles: suggestedCycles(newId), revision: 0 }));
  const continuation = programmesReady ? continuingCyclePlan(client, programmes, suggestion) : suggestion;
  const stored = displayedCyclePlan(client.trainingPlan, continuation);
  const isSuggested = !client.trainingPlan?.revision && !client.trainingPlan?.cycles?.length;
  const saved = { ...stored, cycles: stored.cycles.map(cycle => ({ ...cycle, programId: cycle.programId || (cycle.draftProgramId ? programmes.find(p => !p.excludeFromCyclePlanning && [p.fromTemplateId, p.templateId, p.programId].includes(cycle.draftProgramId))?.id : '') || '' })) };
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [programChoice, setProgramChoice] = useState({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const plan = syncCycleDurations(draft || saved, programmes);
  const timeline = cycleTimeline(plan);
  const history = coachCycleHistory(client, programmes, plan);
  const displayNumbers = cycleDisplayNumbers(history, timeline);
  const cycleNumber = cycle => String(displayNumbers.get(cycle.id)).padStart(2, '0');
  const active = [...timeline, ...(!draft ? history : [])].find(cycle => cycle.id === selected) || timeline.find(cycle => !cycle.closedAt) || timeline[0];
  const stripRef = useCenteredCycle(active?.id, JSON.stringify([clientId, !!draft, [...displayNumbers.keys()]]));
  useEffect(() => { setSelected(null); }, [clientId]);
  const program = programmes.find(item => item.id === active?.programId);
  const preview = programmesReady && active && programmes.some(item => {
    const sessions = item.sessions || item.seances;
    return item.id === cycleSourceId(plan, active.id) && item.__detailsLoaded && Array.isArray(sessions) && sessions.length > 0;
  });
  const nextSession = nextCycleSession(program);
  const total = program ? getProgramPlannedSessionTotal(program) : 0;
  const completed = program?.__detailsLoaded ? getProgramValidatedSessionCount(program) : null;
  const previousProgram = plan.cycles.slice(0, plan.cycles.findIndex(c => c.id === active?.id)).reverse().find(c => c.programId)?.programId;
  const eligiblePrograms = programmes.filter(p => !plan.cycles.some(c => c.id !== active?.id && c.programId === p.id));
  const selectedProgram = eligiblePrograms.find(p => p.id === programChoice[active?.id]) || (eligiblePrograms.length === 1 ? eligiblePrograms[0] : null);
  const finished = program?.__detailsLoaded && getProgramPlannedSessionTotal(program) > 0 && getProgramValidatedSessionCount(program) >= getProgramPlannedSessionTotal(program);
  const typeLabel = type => tx(type, labels[type]);
  const historyLabel = cycle => cycle.state === 'past' ? tx('pastProgram', 'Programme précédent') : tx('availableProgram', 'Programme disponible');
  const historyCard = cycle => <Box key={cycle.id} flex="0 0 auto" mr={2}>
    <Button minW="150px" maxW="240px" h="100%" p={3} borderRadius="16px" variant={active?.id === cycle.id ? 'solid' : 'outline'} aria-pressed={active?.id === cycle.id} onClick={() => setSelected(cycle.id)}>
      <Stack align="start" spacing={1} w="full">
        <Text fontSize="xs" opacity={0.8}>{cycleNumber(cycle)} · {historyLabel(cycle)}</Text>
        <Text>{typeLabel(cycle.type)}</Text>
        <Text fontSize="xs" fontWeight="normal" noOfLines={2}>{cycle.program.nomProgramme || cycle.program.name}</Text>
        <Text fontSize="xs" fontWeight="normal">{cycle.weeks} {cycle.weeks === 1 ? tx('week', 'semaine') : tx('weeks', 'semaines')}</Text>
      </Stack>
    </Button>
  </Box>;
  const change = (id, patch) => setDraft({ ...plan, cycles: plan.cycles.map(c => c.id === id ? { ...c, ...patch, ...(patch.type ? { typeSource: 'coach' } : {}) } : c) });

  async function linkProgram() {
    if (!active || !selectedProgram) return;
    await persist({ ...plan, cycles: plan.cycles.map(c => c.id === active.id ? { ...c, programId: selectedProgram.id } : c) }, async transaction => {
      const snapshot = await transaction.get(doc(db, 'clients', clientId, 'programmes', selectedProgram.id));
      if (!snapshot.exists()) throw new Error('missing-program');
      return null;
    });
  }

  async function persist(next, extra) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      await runTransaction(db, transaction => writeCyclePlan(transaction, doc(db, 'clients', clientId), next, extra));
      setDraft(null);
      toast({ status: 'success', title: tx('saved', 'Programmation enregistrée') });
      return true;
    } catch (e) {
      setError(e.message === 'conflict' ? tx('conflict', 'La programmation a changé sur un autre appareil. Annulez vos modifications puis réessayez.') : tx('error', 'Enregistrement impossible. Vérifiez la connexion, les durées et qu’un programme n’est associé qu’à un cycle.'));
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function prepare(cycle, newVersion = false) {
    if (cycle.draftProgramId && !newVersion) {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true); setError('');
      try {
        await runTransaction(db, async transaction => {
          const clientSnap = await transaction.get(doc(db, 'clients', clientId));
          const draftRef = doc(db, 'programmes', cycle.draftProgramId);
          const draftSnap = await transaction.get(draftRef);
          if (!draftSnap.exists() || !clientSnap.data()?.trainingPlan?.cycles?.some(c => c.id === cycle.id && c.draftProgramId === cycle.draftProgramId)) throw new Error('conflict');
          transaction.update(draftRef, { libraryKind: 'client', preparedForClientId: clientId, preparedForClientName: programClientName(client), preparedForCycleId: cycle.id });
        });
        navigate(`/exercise-bank/program-builder/${cycle.draftProgramId}`, { state: { returnTo: `/clients/${clientId}` } });
      } catch { setError(tx('conflict', 'La programmation a changé sur un autre appareil. Annulez vos modifications puis réessayez.')); }
      finally { busyRef.current = false; setBusy(false); }
      return;
    }
    const sourceId = cycleSourceId(plan, cycle.id);
    if (!sourceId) { setError(tx('sourceRequired', 'Associez d’abord un programme au cycle précédent pour reprendre ses exercices.')); return; }
    const id = newId();
    const next = { ...plan, cycles: plan.cycles.map(c => c.id === cycle.id ? { ...c, draftProgramId: id } : c) };
    let historyPromise;
    const ok = await persist(next, async transaction => {
      const source = await transaction.get(doc(db, 'clients', clientId, 'programmes', sourceId));
      if (!source.exists()) throw new Error('missing-program');
      historyPromise ||= new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('history-timeout')), 12000);
        Promise.all([
          getDocsFromServer(collection(db, 'clients', clientId, 'programmes', sourceId, 'sessionsEffectuees')),
          getDocsFromServer(collection(db, 'training')),
        ]).then(([snapshot, bank]) => resolve({ history: snapshot.docs.map(row => ({ ...row.data(), id: row.id })), bank: bank.docs.map(row => ({ ...row.data(), id: row.data().id || row.id })) }), reject)
          .finally(() => clearTimeout(timer));
      });
      const { history, bank } = await historyPromise;
      const sourceData = source.data();
      const varied = varyCycleExercises(sourceData.sessions || sourceData.seances || [], bank, cycle.type);
      return { ref: doc(db, 'programmes', id), data: {
        ...cycleDraft({ ...sourceData, sessions: varied }, cycle, `${typeLabel(cycle.type)} · ${programClientName(client)}`, coachId, history),
        libraryKind: 'client', preparedForClientId: clientId,
        preparedForClientName: programClientName(client), preparedForCycleId: cycle.id,
      } };
    });
    if (ok) navigate(`/exercise-bank/program-builder/${id}`, { state: { returnTo: `/clients/${clientId}` } });
  }

  const currentCycleId = timeline.find(c => !c.closedAt)?.id;
  const previousCurrentCycle = useRef(currentCycleId);
  useEffect(() => {
    const previousId = previousCurrentCycle.current;
    if (previousId && previousId !== currentCycleId) {
      setSelected(value => value === previousId ? currentCycleId || null : value);
    }
    previousCurrentCycle.current = currentCycleId;
  }, [currentCycleId]);
  return <Box id="training-cycles" scrollMarginTop="100px" bg={surface} borderWidth="1px" borderColor={outline} borderRadius="24px" p={{ base: 4, md: 6 }} mb={5} boxShadow="sm" overflow="hidden">
    <Flex justify="space-between" gap={3} wrap="wrap">
      <Heading size="sm">{tx('title', 'Programmation sportive')}</Heading>
      {!draft && <Button ml="auto" isDisabled={isSuggested && !programmesReady} onClick={() => setDraft(structuredClone(saved))}>{tx('customize', 'Modifier la programmation')}</Button>}
    </Flex>
    {!plan.cycles.length && <Text my={4}>{tx('empty', 'Construisez la suite du suivi. Aucun programme ni rendez-vous ne sera assigné automatiquement.')}</Text>}
    {draft && <Stack as="fieldset" disabled={busy} my={4}>
      <FormControl maxW="320px"><FormLabel fontSize="sm">{tx('planStart', 'Début de la programmation')}</FormLabel><Input type="date" lang={locale} isDisabled={plan.cycles.some(c => c.closedAt)} value={plan.start} onChange={e => setDraft({ ...plan, start: e.target.value })} /></FormControl>
      {!plan.cycles.length && <Button alignSelf="flex-end" maxW="100%" h="auto" minH={8} py={2} whiteSpace="normal" onClick={() => setDraft({ ...plan, cycles: suggestedCycles(newId) })}>{tx('suggest', 'Proposer 6 mois : hypertrophie, récupération, force')}</Button>}
    </Stack>}
    {draft && <Text mt={2} fontSize="xs" color={muted}>{tx('dragCycles', 'Glissez les cycles pour changer leur ordre. Sur mobile, maintenez un cycle puis déplacez-le.')}</Text>}
    <DragDropContext dragHandleUsageInstructions={tx('dragKeyboard', 'Appuyez sur Espace pour saisir un cycle, utilisez les flèches pour le déplacer, puis Espace pour le déposer. Échap pour annuler.')} onDragEnd={({ source, destination }) => {
      if (!draft || busy || !destination) return;
      const cycles = reorderTrainingCycles(plan.cycles, source.index, destination.index);
      if (cycles !== plan.cycles) setDraft({ ...plan, cycles });
    }}>
    <Droppable droppableId={`cycles-${clientId}`} direction="horizontal" isDropDisabled={!draft || busy}>
    {provided => <Flex ref={element => { provided.innerRef(element); stripRef.current = element; }} {...provided.droppableProps} overflowX="auto" py={3} align="stretch" aria-label={tx('timeline', 'Frise des cycles')}>
      {!draft && history.filter(c => c.state === 'past').map(historyCard)}
      {timeline.map((cycle, index) => <Draggable key={cycle.id} draggableId={cycle.id} index={index} disableInteractiveElementBlocking isDragDisabled={!draft || busy || !!cycle.closedAt}>
        {(drag, snapshot) => <Box ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style} flex="0 0 auto" mr={2} opacity={snapshot.isDragging ? 0.9 : 1}>
          <Button {...drag.dragHandleProps} size="sm" borderRadius="16px" minW="150px" h="100%" p={3} whiteSpace="normal" cursor={draft && !busy && !cycle.closedAt ? snapshot.isDragging ? 'grabbing' : 'grab' : 'pointer'} boxShadow={snapshot.isDragging ? 'lg' : 'none'} aria-pressed={active?.id === cycle.id} variant={active?.id === cycle.id ? 'solid' : 'outline'} onClick={() => setSelected(cycle.id)}>
            <Stack align="start" spacing={1} w="full"><Text fontSize="xs" opacity={0.8}>{cycleNumber(cycle)} · {cycle.closedAt ? tx('done', 'Terminé') : cycle.id === currentCycleId ? tx('currentCycle', 'En cours') : tx('upcomingCycle', 'À venir')}</Text><Text>{typeLabel(cycle.type)}</Text><Text fontSize="xs" fontWeight="normal">{cycle.weeks} {cycle.weeks === 1 ? tx('week', 'semaine') : tx('weeks', 'semaines')}</Text></Stack>
          </Button>
        </Box>}
      </Draggable>)}
      {provided.placeholder}
      {!draft && history.filter(c => c.state !== 'past').map(historyCard)}
      {draft && <Button flex="0 0 auto" minW="150px" borderStyle="dashed" borderRadius="16px" isDisabled={busy || plan.cycles.length >= 52} onClick={() => {
        const id = newId();
        setDraft({ ...plan, cycles: [...plan.cycles, { id, type: 'custom', weeks: 4, programId: '', notes: '' }] });
        setSelected(id);
      }}>{tx('add', 'Ajouter un cycle')}</Button>}
    </Flex>}
    </Droppable>
    </DragDropContext>
    {draft && <Stack as="fieldset" disabled={busy}>
      {plan.cycles.map((cycle) => (cycle.id === (active?.id || plan.cycles[0]?.id)) && <Box key={cycle.id} p={{ base: 3, md: 5 }} bg={soft} borderRadius="xl">
        <Flex gap={2} justify="space-between" align="center" wrap="wrap" mb={4}>
          <Text fontWeight="600">{tx('cycleNumber', 'Cycle')} {displayNumbers.get(cycle.id)} · {typeLabel(cycle.type)}</Text>
          {!cycle.programId && !cycle.closedAt && !cycle.draftProgramId && <Button variant="outline" bg={secondaryButtonBg} borderColor={outline} _hover={{ bg: secondaryButtonHover }} isDisabled={busy} onClick={() => setDraft({ ...plan, cycles: plan.cycles.filter(c => c.id !== cycle.id) })}>{tx('removeCycle', 'Retirer ce cycle')}</Button>}
        </Flex>
        <SimpleGrid as="fieldset" disabled={!!cycle.closedAt} columns={{ base: 1, md: 2 }} gap={4}>
          <FormControl><FormLabel fontSize="sm">{tx('cycleKind', 'Type de cycle')}</FormLabel><Select bg={surface} value={cycle.type} onChange={e => change(cycle.id, { type: e.target.value })}>{CYCLE_TYPES.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}</Select><Text fontSize="xs" color={muted} mt={1.5}>{tx(`kindHelp_${cycle.type}`, { general: 'Une phase de préparation avant les cycles plus spécifiques.', endurance: 'Développer la capacité à maintenir et répéter un effort musculaire.', hypertrophy: 'Un cycle orienté vers le développement musculaire.', strength: 'Un cycle orienté vers le développement de la force.', recovery: 'Une phase plus légère entre deux cycles de travail.', custom: 'Une orientation définie librement par le coach.' }[cycle.type])}</Text></FormControl>
          <FormControl><FormLabel fontSize="sm">{tx('cycleDuration', 'Durée du cycle')}</FormLabel><Flex align="center" gap={2}><Input bg={surface} type="number" inputMode="numeric" min={1} max={52} maxW="100px" isDisabled={!!cycle.programId} value={cycle.weeks} onFocus={e => e.target.select()} onChange={e => change(cycle.id, { weeks: Math.min(52, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })} /><Text fontSize="sm">{tx('weeks', 'semaines')}</Text></Flex>{cycle.programId && <Text mt={1.5} color={muted} fontSize="xs">{tx('durationFromProgram', 'Durée reprise du programme associé.')}</Text>}</FormControl>
          <FormControl gridColumn="1 / -1"><FormLabel fontSize="sm">{tx('cycleProgram', 'Programme à utiliser')}</FormLabel>{eligiblePrograms.length || cycle.programId ? <><Select bg={surface} value={cycle.programId} onChange={e => change(cycle.id, { programId: e.target.value })}><option value="">{tx('programLater', 'À préparer plus tard')}</option>{eligiblePrograms.map(p => <option key={p.id} value={p.id}>{p.nomProgramme || p.name || p.id}</option>)}</Select><Text fontSize="xs" color={muted} mt={1.5}>{tx('programHelp', 'Choisissez un programme déjà assigné au client, ou laissez ce cycle à préparer. Le type de cycle ne modifie pas les exercices du programme.')}</Text></> : <Text fontSize="sm" color={muted}>{tx('noProgramChoice', 'Aucun programme déjà assigné à ce client n’est disponible pour ce cycle. Assignez-lui un autre programme pour le choisir ici, sans changer son programme actif.')}</Text>}</FormControl>
        </SimpleGrid>
      </Box>)}
      <Flex mt={3} pt={4} borderTopWidth="1px" borderColor={outline} gap={2} direction={{ base: 'column-reverse', sm: 'row' }} justify="flex-end">
        <Button variant="outline" bg={secondaryButtonBg} borderColor={outline} _hover={{ bg: secondaryButtonHover }} isDisabled={busy} onClick={() => { setDraft(null); setError(''); }}>{tx('discardPlanEdits', 'Annuler les modifications')}</Button>
        <Button variant="solid" isLoading={busy} onClick={() => persist(plan)}>{tx('savePlanEdits', 'Enregistrer la programmation')}</Button>
      </Flex>
    </Stack>}
    {error && <Text role="alert" color="red.500" my={3}>{error}</Text>}
    {active && !draft && <Stack mt={2} spacing={program ? 4 : 2} bg={soft} borderRadius="16px" p={{ base: 3, md: 4 }}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <Box minW={0}>
          <Flex align="center" gap={2} wrap="wrap">
            <Text fontWeight="bold">{typeLabel(active.type)}</Text>
            <Badge whiteSpace="normal" fontSize="10px">{active.historical ? historyLabel(active) : active.closedAt ? tx('done', 'Terminé') : program ? tx('linked', 'Programme associé') : active.draftProgramId ? tx('draftReady', 'Brouillon à finaliser') : preview ? tx('projected', 'Préconfiguré') : tx('planned', 'À préparer')}</Badge>
          </Flex>
          <Text fontSize="sm" color={muted}>{dateText(active.start)}{active.end ? ` → ${dateText(active.end)}` : ''}</Text>
        </Box>
        {!program && !active.closedAt && programmesReady && (active.draftProgramId || previousProgram) && <Flex ml="auto" align="center" gap={1} maxW="100%">
          <CyclePreparationNotice compact />
          <Button variant="solid" isLoading={busy} onClick={() => prepare(active)}>{active.draftProgramId ? tx('finishDraft', 'Finaliser le programme') : tx('prepareCycle', 'Préparer ce cycle')}</Button>
        </Flex>}
      </Flex>
      {program && <Box>
        <Heading size="md" mb={3}>{program.nomProgramme || program.name}</Heading>
        <Flex justify="space-between" gap={3} fontSize="sm"><Text color={muted}>{tx('completedSessions', 'Séances réalisées')}</Text><Text fontWeight="bold">{completed == null ? '—' : completed} / {total}</Text></Flex>
        <Progress mt={2} size="sm" borderRadius="full" value={completed != null && total ? Math.min(100, completed / total * 100) : 0} aria-label={tx('playStep', 'Réaliser les séances')} />
      </Box>}
      {!program && !active.closedAt && programmesReady && <>
      <Box as={active.draftProgramId || previousProgram ? 'details' : 'div'}>
        {(active.draftProgramId || previousProgram) && <RightDisclosureSummary py={0} fontSize="sm" color={muted}>{tx('chooseAlternative', 'Choisir un autre programme')}</RightDisclosureSummary>}
        <Box mt={2}>
        {active.draftProgramId && previousProgram && <Box mb={3}><Button isLoading={busy} onClick={() => prepare(active, true)}>{tx('regenerateDraft', 'Préparer une nouvelle version')}</Button><Text fontSize="sm" mt={1}>{tx('preserveDraft', 'L’ancien brouillon reste dans la bibliothèque. La nouvelle version repart du programme précédent et de ses résultats.')}</Text></Box>}
        <Text mb={3} fontSize="sm">{eligiblePrograms.length ? tx('linkExisting', 'Associez un programme déjà présent sur cette fiche à ce cycle.') : tx('noLinkedProgram', 'Aucun programme n’est encore associé à ce cycle. Choisissez-en un dans votre bibliothèque, puis assignez-le à ce client.')}</Text>
        {eligiblePrograms.length > 0 ? <>
          <FormControl><FormLabel>{tx('program', 'Programme assigné')}</FormLabel><Select value={selectedProgram?.id || ''} onChange={e => setProgramChoice({ ...programChoice, [active.id]: e.target.value })}><option value="">—</option>{eligiblePrograms.map(p => <option key={p.id} value={p.id}>{p.nomProgramme || p.name || p.id}</option>)}</Select></FormControl>
          <Flex mt={3} justify="flex-end"><Button variant="solid" isDisabled={!selectedProgram} isLoading={busy} onClick={linkProgram}>{tx('useProgram', 'Utiliser ce programme')}</Button></Flex>
        </> : <Flex justify="flex-end"><Button variant={active.draftProgramId || previousProgram ? 'outline' : 'solid'} onClick={() => navigate('/programmes')}>{tx('findProgram', 'Choisir ou créer un programme')}</Button></Flex>}
        </Box>
      </Box></>}
      {finished && <Box p={3} borderWidth="1px" borderColor="green.300" borderRadius="lg"><Text fontWeight="bold">✓ {tx('milestone', 'Objectif du cycle atteint')}</Text>{!active.closedAt && !active.historical && <Text mt={1} fontSize="sm">{tx('autoTransition', 'Toutes les séances sont validées. Le passage au cycle suivant se synchronise automatiquement.')}</Text>}</Box>}
      {program && <Flex gap={2} wrap="wrap" justify="flex-end">
        {program && <Button onClick={() => navigate(`/clients/${clientId}/programmes/${program.id}`, { state: { prefetchedProgram: program } })}>{tx('view', 'Voir le programme')}</Button>}
        {program && !active.closedAt && !active.historical && nextSession != null && <Button variant="solid" onClick={() => navigate(`/clients/${clientId}/programmes/${program.id}/session/${nextSession}/play`)}>{tx('startNextSession', 'Commencer la séance suivante')}</Button>}
      </Flex>}
      {program && <Box as="details" borderWidth="1px" borderRadius="16px" p={4}>
        <RightDisclosureSummary py={0} fontWeight="bold">{tx('sessionsResults', 'Séances et résultats')}</RightDisclosureSummary>
        <CycleSessionList key={`${active.id}:${program.id}`} clientId={clientId} program={program} cycle={active} tx={tx} dateText={dateText} />
      </Box>}
    </Stack>}
  </Box>;
}
