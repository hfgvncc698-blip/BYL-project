import LastPackSessionBadge from "../calendar/LastPackSessionBadge";
import { isLastPackSession } from "../../utils/lastPackSession.mjs";
import React from 'react';
import { Text } from '@chakra-ui/react';
import { clubText } from '../../i18n/clubText';
import { participantPacks } from '../../utils/clubParticipantPacks.mjs';

export default function ClubParticipantPacks({client,event}) {
  return participantPacks(client,event).map(pack => <Text as="span" display="block" fontSize="xs" key={pack.id}>
    {isLastPackSession(pack)&&<LastPackSessionBadge/>} {pack.name} · {clubText('{{remaining}} / {{total}} séances restantes',{remaining:pack.remaining,total:pack.quantity})}
  </Text>);
}
