import { HStack, Text, useColorModeValue } from '@chakra-ui/react';
import { StarIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';
export default function CalendarDifficulty({ rating }) {
  useTranslation();
  const filled = useColorModeValue('orange.500', 'yellow.300');
  const empty = useColorModeValue('gray.300', 'whiteAlpha.400');
  const value = Number(rating);
  if (!Number.isFinite(value) || value < 1 || value > 5) return null;
  return <HStack spacing={2} flexWrap="wrap">
    <Text fontSize="sm">{clubText('Difficulté')} :</Text>
    <HStack spacing="2px" aria-hidden="true">{[1,2,3,4,5].map(star => <StarIcon key={star} boxSize="12px" color={star <= Math.round(value) ? filled : empty} />)}</HStack>
    <Text fontSize="sm" fontWeight="semibold">{value}/5</Text>
  </HStack>;
}
