import React, {useState} from 'react';
import {Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Box, Text, Button, HStack, VStack, Badge, Avatar, Tabs, TabList, Tab} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';
import {useAppTheme} from '../../styles/appTheme';

export default function CyclePreparationModal({onClose, clients, onPrepare, loading, error}) {
  const {t}=useTranslation();
  const [tab,setTab]=useState(0);
  const theme=useAppTheme();
  const finished=clients.filter(row=>row.finished).length;
  const noCycle=clients.filter(row=>row.noCycle).length;
  const rows=(loading || error ? [] : clients).filter(row=>tab===0 || (tab===1 ? row.finished : tab===2 ? !row.finished && !row.noCycle : row.noCycle));
  return <Modal isOpen onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
    <ModalOverlay backdropFilter="blur(4px)" />
    <ModalContent mx={3} borderRadius="24px" bg={theme.surfaceBgStrong} color={theme.textColor} maxH="90dvh">
      <ModalHeader pb={2}>{t('cyclePreparation.title')}</ModalHeader>
      <ModalCloseButton aria-label={t('common.close')} />
      <ModalBody pb={5}>
        <Text fontSize="sm" color="gray.500" mb={4}>{t('cyclePreparation.intro')}</Text>
        <Tabs index={tab} onChange={setTab} variant="soft-rounded" colorScheme="blue" mb={4}>
          <TabList gap={2} flexWrap="wrap"><Tab>{t('cyclePreparation.all')} ({clients.length})</Tab><Tab>{t('cyclePreparation.finished')} ({finished})</Tab><Tab>{t('cyclePreparation.soon')} ({clients.length-finished-noCycle})</Tab><Tab>{t('cyclePreparation.noCycle')} ({noCycle})</Tab></TabList>
        </Tabs>
        <VStack align="stretch" spacing={3}>
          {(loading || !rows.length) && <Text py={6} textAlign="center">{t(error ? 'cyclePreparation.loadError' : loading ? 'common.loading' : 'cyclePreparation.empty')}</Text>}
          {rows.map(row=><HStack key={row.clientId} spacing={3} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="18px" p={4} flexWrap={{base:'wrap',md:'nowrap'}}>
            <Avatar name={row.name} size="sm" />
            <Box flex="1" minW="150px"><Text fontWeight="700">{row.name}</Text><Text fontSize="sm" color="gray.500">{row.cycle || t(row.noCycle ? 'cyclePreparation.noCycle' : 'cyclePreparation.cycle')}</Text><Text fontSize="xs" mt={1}>{row.noCycle ? t('cyclePreparation.noCycleDetail') : row.finished ? t('cyclePreparation.finishedDetail') : t('cyclePreparation.endsIn',{count:row.days})}</Text></Box>
            <Badge colorScheme={row.noCycle?'blue':row.finished?'red':'orange'} borderRadius="full" px={2} py={1}>{t(row.noCycle?'cyclePreparation.noCycle':row.finished?'cyclePreparation.finished':'cyclePreparation.soonBadge')}</Badge>
            <Button size="sm" borderRadius="full" variant="outline" colorScheme="blue" onClick={()=>onPrepare(row.clientId)}>{t('cyclePreparation.prepare')}</Button>
          </HStack>)}
        </VStack>
        <Text fontSize="xs" color="gray.500" mt={4}>{t('cyclePreparation.footer')}</Text>
      </ModalBody>
      <ModalFooter pt={0}><Button borderRadius="full" onClick={onClose}>{t('common.close')}</Button></ModalFooter>
    </ModalContent>
  </Modal>;
}
