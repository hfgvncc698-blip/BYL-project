import React from 'react';
import { Box, SimpleGrid, HStack, Heading, Text, Icon } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../styles/appTheme';

export function openAdminProfileTab(setTab, index) {
  setTab(index);
  requestAnimationFrame(() => document.getElementById('admin-profile-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

export default function AdminProfileActions({ items }) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return <SimpleGrid columns={{ base: 2, lg: 4 }} spacing={4} mb={5}>
    {items.map(item => <Box key={item.label} as="button" type="button" {...theme.cardProps} p={{ base: 4, md: 5 }} minW={0} textAlign="start" onClick={item.onClick}
      _hover={{ borderColor: theme.accentBlue, transform: 'translateY(-2px)' }} transition="transform .15s"
      _focusVisible={{ outline: '2px solid', outlineColor: theme.accentBlue, outlineOffset: '3px' }}>
      <HStack spacing={3} align="start"><Box p={3} bg={theme.surfaceSoft} borderRadius="2xl" color={item.color || theme.accentBlue}><Icon as={item.icon} boxSize={6} /></Box><Heading size="sm" overflowWrap="anywhere">{item.label}</Heading></HStack>
      <HStack mt={5} justify="space-between"><Text fontSize="3xl" fontWeight="800">{item.value ?? '→'}</Text><Text fontSize="sm" color={theme.accentBlue}>{t('adminLayout.view')}</Text></HStack>
    </Box>)}
  </SimpleGrid>;
}
