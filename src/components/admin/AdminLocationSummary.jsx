import React from 'react';
import { Box, Button, Heading, HStack, Icon, Text } from '@chakra-ui/react';
import { MdLocationOn } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../styles/appTheme';

export default function AdminLocationSummary({ location }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useAppTheme();
  return <Box {...theme.cardProps} p={5} mb={5}>
    <HStack justify="space-between" flexWrap="wrap" gap={4}>
      <HStack spacing={4}>
        <Icon as={MdLocationOn} boxSize={8} color="blue.500" />
        <Box>
          <Text fontSize="sm">{t('adminLayout.lastLocation')}</Text>
          <Heading size="md" mt={1}>{location && location !== '—' ? location : t('adminLayout.noLocation')}</Heading>
        </Box>
      </HStack>
      <Button onClick={() => navigate('/admin/geo')} variant="outline">{t('adminLayout.openMap')}</Button>
    </HStack>
  </Box>;
}
