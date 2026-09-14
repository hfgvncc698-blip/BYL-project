import React from 'react';
import { Box, Text, Flex, SimpleGrid, Table, Thead, Tbody, Tr, Th, Td, useColorModeValue } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { FAT_RANGES, measurementReference } from '../../utils/measurementReference';
import { referenceLabels } from '../../i18n/measurementReference';

export default function MeasurementReference({metric, profile, data = [], valueFormatter}) {
  const {i18n} = useTranslation();
  const l = referenceLabels(i18n.language);
  const background = useColorModeValue('gray.50','whiteAlpha.50');
  const highlight = useColorModeValue('blue.50','whiteAlpha.100');
  const last = data[data.length-1];
  const first = data[0];
  const context = measurementReference(metric,profile,last?.date);
  const {bands, sex, age} = context;
  const nf = new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1});
  const format = n => nf.format(n);
  const referenceMetric = ['fat','water','bmi'].includes(metric);
  const unit = metric === 'bmi' ? ' kg/m²' : ' %';
  const colors = ['blue.400','green.500','orange.400','red.400'];
  const zone = bands && last && Number.isFinite(last.value) ? bands.findIndex(n=>last.value<n) : null;
  const active = zone === -1 ? bands.length : zone;
  return <Box my={3} p={3} bg={background} borderWidth="1px" borderRadius="xl">
    {bands ? <>
      <Text fontSize="xs" mb={2}>{l[5]} : {age} {l[8]}{sex ? ` · ${l[sex==='male'?6:7]}` : ''}</Text>
      <Text fontWeight="bold" mb={3}>{l[0]} : {last ? format(last.value) : '—'}{unit}{active != null ? ` · ${l[active+1]}` : ''}</Text>
      <Flex gap={1} aria-hidden="true" mb={2}>
        {[...bands,Infinity].map((_,index)=><Box key={index} flex="1" bg={colors[index]} h={active===index?'12px':'8px'} borderRadius="full" alignSelf="center" outline={active===index?'2px solid':'none'} outlineOffset="2px" />)}
      </Flex>
      <SimpleGrid columns={2} gap={2} mt={3}>
        {[...bands,Infinity].map((upper,index)=><Box key={index} borderLeftWidth="3px" borderColor={colors[index]} pl={2} fontSize="xs">
          <Text fontWeight={active===index?'bold':'normal'}>{active===index?'● ':''}{l[index+1]}</Text>
          <Text>{index===0 ? `< ${format(upper)}` : upper===Infinity ? `≥ ${format(bands[index-1])}` : `${format(bands[index-1])} – < ${format(upper)}`}{unit}</Text>
        </Box>)}
      </SimpleGrid>
      {metric==='fat' && <Table size="sm" mt={4} sx={{'th,td':{paddingInline:1,fontSize:'xs'}}}>
        <Thead><Tr><Th>{l[15]}</Th><Th isNumeric>{l[2]} (%)</Th></Tr></Thead>
        <Tbody>{FAT_RANGES[sex].map(([min,max,low,high])=><Tr key={min} bg={age>=min&&age<=max?highlight:undefined} fontWeight={age>=min&&age<=max?'bold':undefined}>
          <Td>{min}–{max} {l[8]}{age>=min&&age<=max?' ●':''}</Td><Td isNumeric>{low} – &lt; {high}</Td>
        </Tr>)}</Tbody>
      </Table>}
      {metric!=='fat' && <Text mt={3} fontSize="xs">{l[16]}</Text>}
      <Text mt={3} fontSize="xs">{l[9]}</Text>
    </> : <>
      <Text fontSize="sm">{referenceMetric ? l[10] : l[11]}</Text>
      {first && last && <SimpleGrid columns={{base:1,sm:3}} gap={2} mt={3}>
        {[[l[12],(valueFormatter||format)(first.value)],[l[13],(valueFormatter||format)(last.value)],[l[14],`${last.value-first.value>0?'+':''}${valueFormatter ? `${format(last.value-first.value)} in` : format(last.value-first.value)}`]].map(([title,value])=><Box key={title} borderLeftWidth="3px" borderColor="blue.400" pl={2}>
          <Text fontSize="xs">{title}</Text><Text fontWeight="bold">{value}</Text>
        </Box>)}
      </SimpleGrid>}
    </>}
  </Box>;
}
