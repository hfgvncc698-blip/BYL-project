import React from 'react';
import {Center,Spinner,Text} from '@chakra-ui/react';
import {useTranslation} from 'react-i18next';

export default function CoachPageAccess({pending}) {
  const {t}=useTranslation();
  return <Center minH="120px" role="status" gap={2}>
    {pending && <Spinner size="sm"/>}
    <Text>{pending?(navigator.onLine?t('common.loading','Chargement…'):t('dashboard.offlineAccess','Connexion nécessaire pour vérifier l’accès.')):t('common.accessDenied','Accès indisponible.')}</Text>
  </Center>;
}
