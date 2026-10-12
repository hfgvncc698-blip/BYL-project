import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clubText, clubLocale } from '../../i18n/clubText';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Text, Button, Stack, Badge, useToast } from '@chakra-ui/react';
import { apiFetch } from '../../utils/api';
export default function useClientClubClasses(uid, enabled) {
  const [classes, setClasses] = useState([]), [error, setError] = useState(''), [selected, setSelected] = useState(null), [saving, setSaving] = useState(false);
  const { i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [contacting, setContacting] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !uid) return;
    const data = await apiFetch('/clubs/my-group-classes');
    setClasses(data.classes || []); setError('');
  }, [uid, enabled]);
  useEffect(() => {
    setClasses([]); setSelected(null); setError('');
    if (!enabled || !uid) return;
    let alive = true;
    const load = async () => { try { const data = await apiFetch('/clubs/my-group-classes'); if (alive) { setClasses(data.classes || []); setError(''); } } catch { if (alive) setError(clubText("Impossible de charger les cours collectifs.")); } };
    load(); const timer = setInterval(load, 30000); window.addEventListener('focus', load); window.addEventListener('club-memberships-changed', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('club-memberships-changed', load); };
  }, [uid, enabled, i18n.language]);
  const current = classes.find(c => `${c.clubId}/${c.id}` === selected);
  const reserve = async action => {
    setSaving(true);
    try {
      await apiFetch(`/clubs/my-group-classes/${encodeURIComponent(current.clubId)}/${encodeURIComponent(current.id)}`, { method: 'POST', body: JSON.stringify({ action }) });
      await refresh(); toast({ title: action === 'join' ? clubText("Réservation enregistrée") : clubText("Désinscription enregistrée"), status: 'success' });
    } catch (e) { toast({ title: clubText(e?.data?.error) || clubText("Réservation impossible. Réessayez."), status: 'error' }); await refresh().catch(() => {}); }
    finally { setSaving(false); }
  };
  const contactClub = async () => {
    if (!current || contacting) return;
    setContacting(true);
    try {
      const result = await apiFetch('/messaging/club/contacts');
      const contact = result.contacts?.find(c => c.clubId === current.clubId && c.kind === 'client')
        || result.contacts?.find(c => c.clubId === current.clubId);
      if (!contact) throw new Error('Club indisponible');
      const start = new Date(current.startsAt);
      const end = new Date(current.startsAt + current.durationMin * 60000);
      const time = date => date.toLocaleTimeString(clubLocale(), {hour:'2-digit', minute:'2-digit'});
      const text = clubText(current.mine === 'registered' || current.mine === 'waiting'
        ? 'Bonjour, je souhaiterais modifier mon inscription au cours « {{title}} » au club {{club}}, le {{date}} de {{start}} à {{end}}. Pouvez-vous me confirmer les possibilités ? Merci.'
        : 'Bonjour, je souhaiterais m’inscrire au cours « {{title}} » au club {{club}}, le {{date}} de {{start}} à {{end}}. Pouvez-vous me confirmer les possibilités ? Merci.',
        {title:current.title,club:current.clubName,date:start.toLocaleDateString(clubLocale()),start:time(start),end:time(end),interpolation:{escapeValue:false}});
      const conversation = `club:${contact.id}`;
      navigate(`/messages?conversation=${encodeURIComponent(conversation)}`, {state:{suggestedMessage:{conversation, text, classRequest:{classId:current.id}}}});
      setSelected(null);
    } catch {
      toast({status:'error', title:clubText('Conversation indisponible'), description:clubText('Impossible d’ouvrir la messagerie du club. Réessayez.')});
    } finally { setContacting(false); }
  };
  const events = classes.map(c => ({ ...c, id: `club:${c.clubId}:${c.id}`, classId: c.id, _clubClass: true,
    title: `${c.title} · ${c.mine === 'registered' ? clubText("Inscrit") : c.mine === 'waiting' ? clubText("Attente {{position}}", {position:c.waitingPosition}) : `${c.participantCount}/${c.capacity}`}`,
    start: new Date(c.startsAt), end: new Date(c.startsAt + c.durationMin * 60000) }));
  const open = event => { setSelected(`${event.clubId}/${event.classId}`); refresh().catch(() => {}); };
  const modal = <Modal isOpen={!!current} onClose={() => setSelected(null)} isCentered>
    <ModalOverlay /><ModalContent><ModalHeader>{current?.title}</ModalHeader><ModalCloseButton />
      <ModalBody><Stack spacing={3}>
        <Text>{current?.clubName} · {current?.coachName}</Text>
        <Text>{current && new Date(current.startsAt).toLocaleString(clubLocale())} · {clubText("{{duration}} min", {duration:current?.durationMin})}</Text>
        <Badge alignSelf="start">{current?.mine === 'registered' ? clubText("Vous êtes inscrit") : current?.mine === 'waiting' ? clubText("Liste d’attente : position {{position}}", {position:current.waitingPosition}) : clubText("Vous n’êtes pas inscrit")}</Badge>
        <Text>{clubText("{{count}} / {{capacity}} participants · {{waiting}} / 5 en attente", {count:current?.participantCount,capacity:current?.capacity,waiting:current?.waitlistCount})}</Text>
        {current?.accessReason && <Text fontSize="sm">{clubText(current.accessReason)}</Text>}
        <Text fontSize="sm">{current?.mode === 'club' ? clubText("Contactez le club pour vous inscrire ou modifier votre inscription.") : current?.registrationNotOpen ? clubText("Les inscriptions ne sont pas encore ouvertes.") : current?.canJoin || current?.canLeave ? clubText("Lorsqu’une place se libère, la première personne en attente est inscrite automatiquement.") : clubText("Les inscriptions sont fermées. Contactez le club pour une modification.")}</Text>
        {current?.mode === 'self' && current?.signupOpensAt != null && <Text fontSize="sm">{clubText("Ouverture des inscriptions : {{date}}", {date: new Date(current.signupOpensAt).toLocaleString(clubLocale())})}</Text>}
        {current?.mode === 'self' && <Text fontSize="xs">{clubText("Inscription jusqu’au {{signup}}. Désinscription jusqu’au {{cancel}}.", {signup:new Date(current.signupDeadline).toLocaleString(clubLocale()),cancel:new Date(current.cancelDeadline).toLocaleString(clubLocale())})}</Text>}
      </Stack></ModalBody>
      <ModalFooter gap={2} flexWrap="wrap"><Button variant="ghost" onClick={() => setSelected(null)}>{clubText("Fermer")}</Button>
        {current && (current.mode === 'club' || (!current.registrationNotOpen && !current.canJoin && !current.canLeave)) && <Button isLoading={contacting} onClick={contactClub}>{clubText("Contacter le club")}</Button>}
        {current?.canJoin && <Button colorScheme="blue" isLoading={saving} onClick={() => reserve('join')}>{current.participantCount < current.capacity ? clubText("M’inscrire") : clubText("Rejoindre la liste d’attente")}</Button>}
        {current?.canLeave && <Button variant="outline" isLoading={saving} onClick={() => reserve('leave')}>{current.mine === 'waiting' ? clubText("Quitter la liste d’attente") : clubText("Me désinscrire")}</Button>}
      </ModalFooter>
    </ModalContent>
  </Modal>;
  return { events, open, modal, error };
}
