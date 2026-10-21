import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

export default function FfmiHelp() {
  const { t } = useTranslation();
  return <Box fontSize="sm" mt={2}>
    <Text>{t('stats.ffmi.explanation')}</Text>
    <Text mt={1}>{t('stats.ffmi.formula')}</Text>
    <Text mt={1}>{t('stats.ffmi.precision')}</Text>
  </Box>;
}
