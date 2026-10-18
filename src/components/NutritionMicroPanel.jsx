import { useState } from 'react';
import { Box, Badge, Button, Checkbox, Collapse, HStack, SimpleGrid, Text } from '@chakra-ui/react';
import NutritionMicroCards from './NutritionMicroCards';
import { useNutritionTheme } from '../styles/nutritionTheme';
import i18n from '../i18n/index';

export default function NutritionMicroPanel({ options, selected, items, onSelect, onRecommend, ready, disabled = false, required = [], detailsOpen, onDetailsChange }) {
  const theme = useNutritionTheme();
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const open = detailsOpen ?? expanded;
  const changeDetails = onDetailsChange || setExpanded;
  return (
    <Box bg={theme.surfaceSoft} borderWidth="1px" borderColor={theme.borderColor} p={3} borderRadius="lg" w="100%" minW={0}>
      <HStack justify="space-between" spacing={2} flexWrap="wrap">
        <Text fontWeight="900">{i18n.t('auto.RationAutoGenerator.micronutriments', 'Micronutriments')}</Text>
        <Badge colorScheme={ready ? 'green' : 'yellow'}>{ready ? i18n.t('auto.RationAutoGenerator.donnees_pretes', 'Données prêtes') : i18n.t('auto.RationAutoGenerator.donnees_en_cours', 'Données...')}</Badge>
      </HStack>
      <SimpleGrid columns={{ base: 2, sm: 4 }} spacing={2} mt={3}>
        <Button size="xs" onClick={() => setChoosing(!choosing)}>{choosing ? i18n.t('auto.RationAutoGenerator.fermer', 'Fermer') : i18n.t('auto.RationAutoGenerator.choisir', 'Choisir')}</Button>
        <Button size="xs" variant="outline" isDisabled={disabled} onClick={onRecommend}>{i18n.t('auto.RationAutoGenerator.precocher', 'Précocher')}</Button>
        <Button size="xs" variant="outline" isDisabled={disabled} onClick={() => onSelect(options.map(option => option.key))}>{i18n.t('auto.RationAutoGenerator.tout_cocher', 'Tout cocher')}</Button>
        <Button size="xs" variant="outline" isDisabled={disabled} onClick={() => onSelect(required)}>{i18n.t('auto.RationAutoGenerator.tout_decocher', 'Tout décocher')}</Button>
      </SimpleGrid>
      <Text fontSize="sm" opacity={0.75} mt={2}>{i18n.t('auto.RationAutoGenerator.nutriments_selectionnes_count', '{{count}} nutriment(s) sélectionné(s)', { count: selected.length })}</Text>
      <Collapse in={choosing} animateOpacity>
        <Box mt={3} maxH="260px" overflowY="auto" bg={theme.surfaceBgStrong} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" p={3}>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={2}>
            {options.map(option => <Checkbox key={option.key} isChecked={selected.includes(option.key)} isDisabled={disabled || required.includes(option.key)} onChange={() => onSelect(selected.includes(option.key) ? selected.filter(key => key !== option.key) : [...selected, option.key])}><Text fontSize="sm">{option.label}</Text></Checkbox>)}
          </SimpleGrid>
        </Box>
      </Collapse>
      <HStack mt={3} justify="space-between" spacing={2}>
        <Text fontSize="sm" opacity={0.75}>{i18n.t('auto.RationAutoGenerator.micros_calcules_totaux_jour', 'Micros calculés (totaux jour)')}</Text>
        <Button size="xs" variant="outline" onClick={() => changeDetails(!open)}>{open ? i18n.t('auto.RationAutoGenerator.masquer', 'Masquer') : i18n.t('auto.RationAutoGenerator.details', 'Détails')}</Button>
      </HStack>
      <Collapse in={open} animateOpacity><Box mt={3}><NutritionMicroCards items={items} /></Box></Collapse>
    </Box>
  );
}
