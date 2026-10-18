import { RATION_MEALS } from "../../utils/rationMealSelection";
import { useState } from 'react';
import { Box, Button, HStack, Menu, MenuButton, MenuDivider, MenuItemOption, MenuList, MenuOptionGroup, Text, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';

const copy = {
  fr: ['Repas de la journée', 'Choisissez les repas autour desquels construire la ration.', 'Aperçu', 'Petit déjeuner', 'Collation du matin', 'Déjeuner', 'Collation de l’après-midi', 'Dîner', 'Collation du soir', '{{count}} repas sélectionnés', 'Répartir sur les repas choisis', 'Aperçu visuel : les cases sont interactives. La répartition n’est pas encore activée et votre ration reste inchangée.'],
  en: ['Daily meals', 'Choose the meals to build the daily plan around.', 'Preview', 'Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner', 'Evening snack', '{{count}} meals selected', 'Distribute across selected meals', 'Visual preview: checkboxes are interactive. Distribution is not enabled yet and your plan remains unchanged.'],
  es: ['Comidas del día', 'Elige las comidas para organizar la ración.', 'Vista previa', 'Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena', 'Colación nocturna', '{{count}} comidas seleccionadas', 'Repartir entre las comidas elegidas', 'Vista previa: las casillas son interactivas. La distribución aún no está activada y la ración no cambia.'],
  it: ['Pasti della giornata', 'Scegli i pasti su cui costruire la razione.', 'Anteprima', 'Colazione', 'Spuntino mattutino', 'Pranzo', 'Merenda', 'Cena', 'Spuntino serale', '{{count}} pasti selezionati', 'Distribuisci sui pasti scelti', 'Anteprima: le caselle sono interattive. La distribuzione non è ancora attiva e la razione resta invariata.'],
  de: ['Mahlzeiten des Tages', 'Wähle die Mahlzeiten für den Tagesplan.', 'Vorschau', 'Frühstück', 'Vormittagssnack', 'Mittagessen', 'Nachmittagssnack', 'Abendessen', 'Abendsnack', '{{count}} Mahlzeiten ausgewählt', 'Auf gewählte Mahlzeiten verteilen', 'Vorschau: Die Auswahl ist interaktiv. Die Verteilung ist noch nicht aktiviert und der Plan bleibt unverändert.'],
  ru: ['Приёмы пищи на день', 'Выберите приёмы пищи для составления рациона.', 'Предпросмотр', 'Завтрак', 'Утренний перекус', 'Обед', 'Полдник', 'Ужин', 'Вечерний перекус', 'Выбрано приёмов пищи: {{count}}', 'Распределить по выбранным приёмам', 'Предпросмотр: флажки интерактивны. Распределение пока не включено, рацион не изменяется.'],
  ar: ['وجبات اليوم', 'اختر الوجبات التي سيُبنى عليها النظام الغذائي.', 'معاينة', 'الفطور', 'وجبة خفيفة صباحية', 'الغداء', 'وجبة خفيفة بعد الظهر', 'العشاء', 'وجبة خفيفة مسائية', '{{count}} وجبات محددة', 'التوزيع على الوجبات المختارة', 'معاينة مرئية: يمكن تغيير الاختيارات. التوزيع غير مفعّل بعد ولن يتغير النظام الغذائي.'],
};

const helpCopy = {
  fr: { auto: 'La ration sera recalculée sur ces repas. Les quantités actuelles seront remplacées.', manual: 'Les repas décochés seront retirés de la ration. Les autres quantités seront conservées.', apply: 'Appliquer' },
  en: { auto: 'Recalculate the plan for these meals, replacing current quantities.', manual: 'Unchecked meals will be removed. Other quantities will be kept.', apply: 'Apply' },
  es: { auto: 'La ración se recalculará para estas comidas y sustituirá las cantidades actuales.', manual: 'Se eliminarán las comidas desmarcadas. Las demás cantidades se conservarán.', apply: 'Aplicar' },
  it: { auto: 'La razione verrà ricalcolata per questi pasti, sostituendo le quantità attuali.', manual: 'I pasti deselezionati verranno rimossi. Le altre quantità saranno conservate.', apply: 'Applica' },
  de: { auto: 'Der Plan wird für diese Mahlzeiten neu berechnet. Aktuelle Mengen werden ersetzt.', manual: 'Abgewählte Mahlzeiten werden entfernt. Andere Mengen bleiben erhalten.', apply: 'Anwenden' },
  ru: { auto: 'Рацион будет пересчитан для этих приёмов пищи. Текущие количества будут заменены.', manual: 'Невыбранные приёмы пищи будут удалены. Остальные количества сохранятся.', apply: 'Применить' },
  ar: { auto: 'سيُعاد حساب النظام لهذه الوجبات وستُستبدل الكميات الحالية.', manual: 'ستُحذف الوجبات غير المحددة مع الاحتفاظ بالكميات الأخرى.', apply: 'تطبيق' },
};

export default function MealSelectionMenu({ value, onApply, disabled, manual = false, inline = false }) {
  const { i18n } = useTranslation();
  const labels = copy[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || copy.fr;
  const [selected, setSelected] = useState(value);
  const menu = useDisclosure();
  const help = helpCopy[(i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0]] || helpCopy.fr;
  const muted = useColorModeValue('gray.600', 'gray.300');
  return <HStack mb={inline ? 0 : 4} ml={inline ? "auto" : undefined} maxW="100%" spacing={2} flexWrap="wrap">
    <Menu closeOnSelect={false} placement="bottom-start" isOpen={menu.isOpen} onClose={menu.onClose} onOpen={() => { setSelected(value); menu.onOpen(); }}>
      <MenuButton as={Button} size="sm" variant="outline" borderRadius="full"
        isDisabled={disabled} rightIcon={<ChevronDownIcon />} maxW="100%" minH="40px" h="auto" py={2}
        whiteSpace="normal" textAlign="start">
        {labels[0]} · {value.length}
      </MenuButton>
      <MenuList minW="0" w="300px" maxW="calc(100vw - 32px)" p={1} zIndex="popover">
        <MenuOptionGroup type="checkbox" value={selected}
          onChange={values => setSelected(values)}>
          {labels.slice(3, 9).map((label, index) => (
            <MenuItemOption key={index} value={RATION_MEALS[index]} fontSize="sm" minH="40px" borderRadius="md">
              {label}
            </MenuItemOption>
          ))}
        </MenuOptionGroup>
        <MenuDivider />
        <Box px={3} pb={2}>
          <Text fontSize="xs" color={muted} mb={2}>{manual ? help.manual : help.auto}</Text>
          <Button size="sm" w="100%" whiteSpace="normal" h="auto" minH="40px" py={2}
            isDisabled={disabled || !selected.length}
            onClick={() => { onApply(selected); menu.onClose(); }}>{manual ? help.apply : labels[10]}</Button>
        </Box>
      </MenuList>
    </Menu>
  </HStack>;
}
