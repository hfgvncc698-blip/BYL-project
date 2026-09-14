import React, { useRef, useState } from 'react';
import { Box, Button, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import { doc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../../firebaseConfig';

const messages = {
  fr: ['Organisation du suivi sportif', 'Programmation sportive', 'Programmes uniquement', 'Vous pouvez changer de vue à tout moment. Les cycles et les programmes sont conservés.', 'Enregistrement impossible. Réessayez.'],
  en: ['Sports follow-up layout', 'Training cycles', 'Programmes only', 'Switch views at any time. Cycles and programmes are preserved.', 'Could not save. Please retry.'],
  es: ['Organización del seguimiento deportivo', 'Planificación deportiva', 'Solo programas', 'Puedes cambiar de vista en cualquier momento. Se conservan los ciclos y programas.', 'No se pudo guardar. Inténtalo de nuevo.'],
  it: ['Organizzazione del percorso sportivo', 'Pianificazione sportiva', 'Solo programmi', 'Puoi cambiare vista in qualsiasi momento. Cicli e programmi vengono conservati.', 'Salvataggio non riuscito. Riprova.'],
  de: ['Ansicht der Trainingsbetreuung', 'Trainingsplanung', 'Nur Programme', 'Die Ansicht lässt sich jederzeit ändern. Zyklen und Programme bleiben erhalten.', 'Speichern fehlgeschlagen. Bitte erneut versuchen.'],
  ru: ['Организация тренировок', 'Планирование циклов', 'Только программы', 'Вид можно изменить в любой момент. Циклы и программы сохраняются.', 'Не удалось сохранить. Повторите попытку.'],
  ar: ['تنظيم المتابعة الرياضية', 'تخطيط الدورات', 'البرامج فقط', 'يمكن تغيير العرض في أي وقت. تُحفظ الدورات والبرامج.', 'تعذّر الحفظ. حاول مجددًا.'],
};

export default function SportViewPreference({ clientId, value }) {
  const { i18n } = useTranslation();
  const labels = messages[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || messages.fr;
  const background = useColorModeValue('blackAlpha.50', 'whiteAlpha.100');
  const selectedBackground = useColorModeValue('white', 'gray.700');
  const muted = useColorModeValue('gray.600', 'gray.300');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);
  const save = async next => {
    if (lock.current || next === value) return;
    lock.current = true; setBusy(true); setError(false);
    try { await updateDoc(doc(db, 'clients', clientId), { sportFollowView: next }); }
    catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Box mb={3}>
    <Flex justify="flex-end">
      <Flex role="group" aria-label={labels[0]} aria-busy={busy} bg={background} borderRadius="full" p={1} gap={1} w="100%" maxW="100%">
        {['cycles', 'programs'].map((mode, index) => <Button key={mode} size="sm" variant="ghost" borderRadius="full" flex="1 1 0" minW={0} minH="40px" h="auto" py={2} px={{ base: 3, md: 4 }} fontSize="xs" whiteSpace="normal" aria-pressed={value === mode} isDisabled={busy} bg={value === mode ? selectedBackground : 'transparent'} color={value === mode ? 'inherit' : muted} boxShadow={value === mode ? 'sm' : 'none'} onClick={() => save(mode)}>{labels[index + 1]}</Button>)}
      </Flex>
    </Flex>
    {error && <Text role="alert" color="red.500" mt={2}>{labels[4]}</Text>}
  </Box>;
}
