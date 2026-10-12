import { useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '@chakra-ui/react';
import { registerNavigationSave, flushNavigationSaves } from '../utils/pendingNavigationSaves';
export function useNavigationSave(save, enabled = true) {
  const latest = useRef(save);
  useLayoutEffect(() => { latest.current = save; });
  useLayoutEffect(() => enabled ? registerNavigationSave(() => latest.current()) : undefined, [enabled]);
}
export function useSavedNavigation() {
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  const toast = useToast();
  const leave = async action => {
    if (busy.current) return;
    busy.current = true; setLeaving(true);
    try { await flushNavigationSaves(); await action(); }
    catch { toast({ status: 'error', title: 'Enregistrement impossible', description: 'Vos modifications restent sur cette page. Réessayez avant de revenir en arrière.', isClosable: true }); }
    finally { busy.current = false; setLeaving(false); }
  };
  return { leave, leaving };
}
