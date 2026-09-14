import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { recommendedCyclePlacement } from '../../utils/cycleAssignment';
import { FormControl, FormLabel, Select, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

const copy = {
  fr: ['Place dans le suivi', 'Ajouter séparément', 'Remplacer le programme du cycle actuel', 'Utiliser pour le prochain cycle', 'Les anciennes séances restent conservées. Le prochain cycle doit être libre.'],
  en: ['Place in the plan', 'Add separately', 'Replace the current cycle programme', 'Use for the next cycle', 'Previous sessions are retained. The next cycle must be empty.'],
  es: ['Lugar en el plan', 'Añadir por separado', 'Reemplazar el programa del ciclo actual', 'Usar para el siguiente ciclo', 'Las sesiones anteriores se conservan. El siguiente ciclo debe estar libre.'],
  it: ['Posizione nel piano', 'Aggiungi separatamente', 'Sostituisci il programma del ciclo attuale', 'Usa per il prossimo ciclo', 'Le sessioni precedenti sono conservate. Il prossimo ciclo deve essere libero.'],
  de: ['Position im Plan', 'Separat hinzufügen', 'Programm des aktuellen Zyklus ersetzen', 'Für den nächsten Zyklus verwenden', 'Bisherige Einheiten bleiben erhalten. Der nächste Zyklus muss frei sein.'],
  ru: ['Место в плане', 'Добавить отдельно', 'Заменить программу текущего цикла', 'Использовать для следующего цикла', 'Предыдущие тренировки сохраняются. Следующий цикл должен быть свободен.'],
  ar: ['الموضع في الخطة', 'إضافة بشكل منفصل', 'استبدال برنامج الدورة الحالية', 'استخدام للدورة التالية', 'تُحفظ الحصص السابقة. يجب أن تكون الدورة التالية متاحة.'],
};
export default function AssignmentPlacement({ value, onChange, disabled = false, clientId, client }) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!clientId || client) return;
    let active = true;
    getDoc(doc(db, 'clients', clientId)).then(snap => { if (active) setLoaded({ id: clientId, data: snap.data() }); }).catch(() => {});
    return () => { active = false; };
  }, [clientId, client]);
  const selected = value === 'auto' ? recommendedCyclePlacement(client || (loaded?.id === clientId ? loaded.data : {})) : value;
  useEffect(() => {
    const data = client || (loaded?.id === clientId ? loaded.data : null);
    if (value === 'auto' && data) onChange(recommendedCyclePlacement(data));
  }, [client, clientId, loaded, value, onChange]);
  const { i18n } = useTranslation();
  const labels = copy[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || copy.fr;
  return <FormControl isDisabled={disabled} mt={3}><FormLabel>{labels[0]}</FormLabel><Select value={selected} onChange={e => onChange(e.target.value)}>
    {['separate', 'current', 'next'].map((option, index) => <option key={option} value={option}>{labels[index + 1]}</option>)}
  </Select><Text fontSize="sm" mt={2}>{labels[4]}</Text></FormControl>;
}
