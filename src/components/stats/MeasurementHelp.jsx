import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import RightDisclosureSummary from '../ui/RightDisclosureSummary';
import { measurementHelp } from '../../i18n/measurementHelp';
import MeasurementReference from './MeasurementReference';

export default function MeasurementHelp({ metric, profile, data, valueFormatter }) {
  const { i18n } = useTranslation();
  const help = measurementHelp(i18n.language, metric);
  const muted = useColorModeValue('gray.600', 'gray.400');
  if (!help) return null;
  return <Box as="details" mt={3} position="relative" data-testid={`measurement-help-${metric}`}>
    <RightDisclosureSummary py={1} fontSize="xs" color={muted}>{help.title}</RightDisclosureSummary>
    <Box pt={2} fontSize="sm" color={muted}>
      <Text>{help.text}</Text>
      <MeasurementReference metric={metric} profile={profile} data={data} valueFormatter={valueFormatter} />
      <Text mt={2} fontSize="xs">{help.disclaimer}</Text>
    </Box>
  </Box>;
}
