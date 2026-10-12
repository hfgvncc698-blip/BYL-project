import LastPackSessionBadge from "../calendar/LastPackSessionBadge";
import { eventLastPacks } from "../../utils/lastPackSession.mjs";
import CalendarDifficulty from "../calendar/CalendarDifficulty";
import ClubParticipantPacks from './ClubParticipantPacks';
import { clubText } from "../../i18n/clubText";
import { useTranslation } from "react-i18next";
import React, { useState, useRef, useEffect } from "react";
import { Box, Button, Portal, Text, useColorModeValue } from "@chakra-ui/react";

export default function ClubCalendarEventPreview({ event, children, clients = [], loading, error, onSelect, details, actionLabel }) {
  const { t, i18n } = useTranslation();
  const formatTime = date => new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr", { hour: "numeric", minute: "2-digit" }).format(date);
  const [position, setPosition] = useState(null);
  const closeTimer = useRef(null);
  const previewRef = useRef(null);
  const keepOpen = () => clearTimeout(closeTimer.current);
  const closeSoon = () => { keepOpen(); closeTimer.current = setTimeout(() => setPosition(null), 250); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!position) return;
    const dismiss = e => {
      // Scrolling the preview's participant list must remain possible.
      if (e.type === 'scroll' && previewRef.current?.contains(e.target)) return;
      clearTimeout(closeTimer.current);
      setPosition(null);
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [position]);
  const bg = useColorModeValue("white", "gray.800");
  const color = useColorModeValue("gray.900", "white");
  const show = e => {
    keepOpen();
    const rect = (e.target.closest('.rbc-event') || e.currentTarget.querySelector('.rbc-event'))?.getBoundingClientRect();
    if (rect) {
      const above = rect.top - 16, below = window.innerHeight - rect.bottom - 16;
      const useAbove = above > below;
      const height = Math.min(620, Math.max(120, useAbove ? above : below), window.innerHeight - 16);
      const width = Math.min(360, window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, height,
        ...(useAbove ? { bottom: Math.max(8, window.innerHeight - rect.top + 8) } : { top: Math.max(8, rect.bottom + 8) }) });
    }
  };
  const lastPacks = event.lastSessionPacks || eventLastPacks(clients.flatMap(client => (client.packs || []).map(pack => ({...pack,clientName:client.name}))), event);
  const name = id => clients.find(client => client.id === id)?.name || clubText("Participant indisponible");
  return <Box display="contents" sx={lastPacks.length ? {'& .rbc-event': {boxShadow:'inset 5px 0 0 #ED8936', outline:'2px solid #ED8936'}, '& .rbc-event-content::after': {content:'"!"', position:'absolute', right:'2px', bottom:'2px', background:'#FBD38D', color:'#1A202C', borderRadius:'4px', padding:'0 4px', fontWeight:'bold'}} : undefined} data-club-event-id={event.id} tabIndex={0} role="group" aria-label={event.title} onMouseEnter={show} onMouseLeave={closeSoon} onFocus={show} onBlur={closeSoon} onKeyDown={e => { if (e.key === "Escape") { setPosition(null); return; } if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setPosition(null); onSelect(event); } }}>
    {children}
    {position && <Portal><Box ref={previewRef} role="tooltip" tabIndex={0} aria-label={event.title} position="fixed" left={position.left} top={position.top} bottom={position.bottom} zIndex="tooltip" w={position.width} maxH={position.height} overflowY="auto" overscrollBehavior="contain" pointerEvents="auto" onMouseEnter={keepOpen} onMouseLeave={closeSoon} onFocus={keepOpen} onBlur={closeSoon} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setPosition(null); }} bg={bg} color={color} borderWidth="1px" borderRadius="xl" boxShadow="xl" p={3}>
      <Text fontWeight="bold">{event.title}{event.type === 'group' && <> · {event.participantIds?.length || 0}/{event.capacity}</>}</Text>
      <Text fontSize="sm">{formatTime(event.start)} – {formatTime(event.end)}</Text>
      <Text fontSize="sm" mb={2}>{event.coachName && <>{event.coachName} · </>}{t(({ "validée": "status.validated", "manquée": "status.missed", "annulée": "common.cancelled" })[event.status] || "status.upcoming")}</Text>
      {lastPacks.map((pack,index) => <Box key={`${pack.id}:${index}`} my={2}><LastPackSessionBadge/><Text fontSize="xs">{pack.clientName ? `${pack.clientName} · ` : ''}{pack.name}</Text></Box>)}
      {event.packProgress && <Text fontSize="sm" fontWeight="bold">{t("calendar.pack_session", {number:event.packProgress.number,total:event.packProgress.total})} · {event.packProgress.name}</Text>}
      <CalendarDifficulty rating={event.difficultyRating} />
      {details || (event.type !== 'group' ? <>
        {event.clientName && <Text fontWeight="bold">{event.clientName}</Text>}
        {event.programTitle && <Text fontSize="sm">{event.programTitle}</Text>}
        {event.sessionTitle && <Text fontSize="sm">{event.sessionTitle}</Text>}
      </> : loading ? <Text>{clubText("Chargement…")}</Text> : error ? <Text>{error}</Text> : <>
        {(event.participantIds || []).map(id => <Text key={id} fontSize="sm">{name(id)}<ClubParticipantPacks client={clients.find(client=>client.id===id)} event={event}/></Text>)}
        {!event.participantIds?.length && <Text fontSize="sm">{clubText("Aucun participant inscrit")}</Text>}
        {!!event.waitlistIds?.length && <Text mt={2} fontWeight="bold">{clubText("Liste d’attente")}</Text>}
        {(event.waitlistIds || []).map((id, index) => <Text key={id} fontSize="sm">{index + 1}. {name(id)}<ClubParticipantPacks client={clients.find(client=>client.id===id)} event={event}/></Text>)}
      </>)}
      <Button mt={2} size="xs" variant="ghost" whiteSpace="normal" onClick={e => { e.stopPropagation(); setPosition(null); onSelect(event); }}>{actionLabel || clubText(event.type === "group" ? "Cliquer pour gérer les inscriptions" : "Voir les détails et modifier")}</Button>
    </Box></Portal>}
  </Box>;
}
