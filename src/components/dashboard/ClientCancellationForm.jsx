import React from "react";
import { Box, Text, FormControl, FormLabel, Textarea, Button } from "@chakra-ui/react";
import { clubText } from "../../i18n/clubText";

export default function ClientCancellationForm({decision, cancelPolicy, cancelExpanded, calendarCulture, cancelReason, setCancelReason, cancelBusy, cancelAssignedSession}) {
  return (<>{decision&&<Text fontSize="sm" mb={3}>{clubText(decision==='accepted'?'Absence excusée':decision==='rejected'?'Justification refusée':'Justification à examiner')}</Text>}{cancelPolicy&&<Box mb={3}>
              {cancelExpanded&&<Box id="client-cancellation-form" mt={3} borderWidth="1px" borderRadius="lg" p={3}>
                <Text fontSize="sm">{clubText('Annulation possible avant le {{deadline}}.',{deadline:new Date(cancelPolicy.deadline).toLocaleString(calendarCulture)})}</Text>
                {(cancelPolicy.canCancel||cancelPolicy.canJustify) ? <><FormControl mt={2} isRequired><FormLabel>{clubText("Motif de l’annulation")}</FormLabel><Text fontSize="sm" mb={2}>{cancelPolicy.pro?'Votre motif sera transmis à votre coach. Après la date limite, le crédit est conservé jusqu’à acceptation de votre demande.':clubText('Votre motif sera transmis au club et au coach pour validation.')}</Text><Textarea value={cancelReason} maxLength={2000} onChange={e=>setCancelReason(e.target.value)} /></FormControl><Button mt={2} colorScheme="red" variant="outline" isLoading={cancelBusy} isDisabled={!cancelReason.trim()} onClick={cancelAssignedSession}>{cancelPolicy.canCancel?clubText("Confirmer l’annulation"):"Envoyer la justification"}</Button></> : <Text fontSize="sm">{clubText("L’annulation n’est plus disponible.")}</Text>}
              </Box>}
            </Box>}</>);
}
