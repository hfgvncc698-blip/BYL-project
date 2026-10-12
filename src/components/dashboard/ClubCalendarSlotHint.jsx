import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Box, Portal, useColorModeValue } from "@chakra-ui/react";

// Keep pointer updates local: rerendering the calendar can interrupt its selection gesture.
const ClubCalendarSlotHint = forwardRef(function ClubCalendarSlotHint({ formatTime, disabled, scope = "#club-dashboard-calendar, #club-calendar", prefix = "+ " }, ref) {
  const [hint, setHint] = useState(null);
  const selection = useRef(null);
  const bg = useColorModeValue("gray.800", "gray.100");
  const color = useColorModeValue("white", "gray.900");
  useImperativeHandle(ref, () => ({
    select(range) {
      selection.current = range;
      setHint(current => current && { ...current, label: `${formatTime(range.start)} – ${formatTime(range.end)}` });
    },
  }), [formatTime]);

  useEffect(() => {
    const clear = () => { selection.current = null; setHint(null); };
    clear();
    if (disabled) return;
    const move = e => {
      const column = e.target.closest?.(scope.split(',').map(selector => `${selector.trim()} .rbc-day-slot`).join(','));
      if (!column || e.target.closest('.rbc-event, .rbc-overlay') || (e.buttons && !selection.current)) {
        setHint(null);
        return;
      }
      const slots = column.querySelectorAll('[data-club-slot-time]');
      const rect = column.getBoundingClientRect();
      if (!slots.length || !rect.height) return;
      // Same floor-to-slot calculation as react-big-calendar's closestSlotFromPoint.
      const index = Math.max(0, Math.min(slots.length - 1, Math.floor((e.clientY - rect.top) / rect.height * slots.length)));
      const time = new Date(Number(slots[index].dataset.clubSlotTime));
      const range = selection.current;
      setHint({ x: e.clientX, y: e.clientY, label: range ? `${formatTime(range.start)} – ${formatTime(range.end)}` : formatTime(time) });
    };
    const leave = e => { if (!e.relatedTarget) clear(); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', clear);
    document.addEventListener('mouseout', leave);
    document.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', clear);
      document.removeEventListener('mouseout', leave);
      document.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
    };
  }, [disabled, formatTime, scope]);

  return hint && !disabled ? <Portal>
    <Box data-calendar-slot-hint="" aria-hidden="true" position="fixed" pointerEvents="none" zIndex="tooltip"
      left={Math.max(8, Math.min(hint.x + 14, window.innerWidth - 180))}
      top={Math.max(8, Math.min(hint.y + 16, window.innerHeight - 36))}
      bg={bg} color={color} px={2} py={1} borderRadius="md" boxShadow="md"
      fontSize="11px" lineHeight="16px" fontWeight="semibold" whiteSpace="nowrap">
      {prefix}{hint.label}
    </Box>
  </Portal> : null;
});

export default ClubCalendarSlotHint;
