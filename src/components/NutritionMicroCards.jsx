import { Box, Text, Wrap, WrapItem } from '@chakra-ui/react';
import { useNutritionTheme } from '../styles/nutritionTheme';
import i18n from '../i18n/index';

export function formatMicroTargetHint(target) {
  if (!target || (target.value == null && !target.requiresClinicalReview && target.direction !== 'review')) {
    return i18n.t('auto.RationAutoGenerator.no_micro_target', 'Cible non définie');
  }
  if (target.direction === 'review' || target.requiresClinicalReview) {
    return i18n.t('auto.RationAutoGenerator.a_individualiser', 'à individualiser');
  }
  const value = `${Math.round(Number(target.value) * 10) / 10}${target.unit ? ` ${target.unit}` : ''}`;
  if (target.direction === 'max') return i18n.t('auto.RationAutoGenerator.micro_max', 'Maximum : {{value}}', { value });
  if (target.direction === 'info') return i18n.t('auto.RationAutoGenerator.repere_value', 'repère {{value}}', { value });
  return i18n.t('auto.RationAutoGenerator.micro_target', 'Cible : {{value}}', { value });
}

export default function NutritionMicroCards({ items = [] }) {
  const theme = useNutritionTheme();
  return (
    <Wrap spacing={2}>
      {items.map(item => (
        <WrapItem key={item.key || item.label} maxW="100%">
          <Box borderWidth="1px" borderColor={theme.borderColor} bg={theme.surfaceBgStrong} p={3} borderRadius="md" w="100%" minW={0}>
            <Text fontSize="sm" fontWeight="700" overflowWrap="anywhere">{item.label} : {item.value}{item.unit ? ` ${item.unit}` : ''}</Text>
            <Text mt={1} fontSize="sm" color={theme.mutedText}>{formatMicroTargetHint(item.target)}</Text>
          </Box>
        </WrapItem>
      ))}
    </Wrap>
  );
}
