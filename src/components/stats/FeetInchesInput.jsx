import React from 'react';
import { Box, HStack, Input, Text, useColorModeValue } from '@chakra-ui/react';
import { splitInches } from '../../utils/imperialHeight';

// Parent stores total inches, so BMI and save conversions use the same value.
export default function FeetInchesInput({value,onChange,label}) {
  const {feet,inches}=splitInches(value);
  const bg=useColorModeValue('whiteAlpha.600','whiteAlpha.50');
  return <HStack w="full" minW={0} spacing={0} h="40px" borderWidth="1px" borderRadius="full" bg={bg} px={2} _focusWithin={{borderColor:'blue.500',boxShadow:'0 0 0 1px var(--chakra-colors-blue-500)'}}>
    <Input variant="unstyled" border="0" boxShadow="none" bg="transparent" _focusVisible={{boxShadow:'none'}} textAlign="center" flex="1" minW={0} px={1} type="number" min={0} step={1} aria-label={`${label} (ft)`} value={feet}
      onChange={e=>onChange(e.target.value==='' && !inches?'':Number(e.target.value)*12+Number(inches||0))}/><Text flexShrink={0} fontSize="sm">ft</Text>
    <Box h="20px" borderLeftWidth="1px" mx={2} aria-hidden="true" />
    <Input variant="unstyled" border="0" boxShadow="none" bg="transparent" _focusVisible={{boxShadow:'none'}} textAlign="center" flex="1" minW={0} px={1} type="number" min={0} max={11.9} step={0.1} aria-label={`${label} (in)`} value={inches}
      onChange={e=>onChange(e.target.value==='' && !feet?'':Number(feet||0)*12+Number(e.target.value))}/><Text flexShrink={0} fontSize="sm">in</Text>
  </HStack>;
}
