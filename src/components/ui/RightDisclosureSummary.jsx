import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

export default function RightDisclosureSummary({ children, ...props }) {
  return <Flex as="summary" align="center" justify="space-between" gap={3} cursor="pointer" py={3}
    listStyle="none" sx={{ '&::-webkit-details-marker': { display: 'none' }, 'details[open] > & .disclosure-chevron': { transform: 'rotate(180deg)' } }}
    _focusVisible={{ outline: '2px solid', outlineColor: 'blue.500', outlineOffset: '2px', borderRadius: 'md' }} {...props}>
    <Box flex="1" minW={0}>{children}</Box>
    <ChevronDownIcon className="disclosure-chevron" aria-hidden="true" boxSize={5} flexShrink={0} />
  </Flex>;
}
