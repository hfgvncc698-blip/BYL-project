import React, { useId, useRef, useState } from 'react';
import { Box, Input, InputGroup, InputRightElement, IconButton, Text, useOutsideClick, useColorModeValue, Portal, usePopper } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';

const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
const clientName = client => client.name || client.clientName || [client.prenom || client.firstName, client.nom || client.lastName].filter(Boolean).join(' ') || client.id;

export default function ClubClientPicker({ clients, value, onChange, portalContainerRef, ...props }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const input = useRef(null);
  const list = useRef(null);
  const { referenceRef, getPopperProps } = usePopper({ enabled: open, placement: 'bottom-start', strategy: 'fixed', matchWidth: true, gutter: 4 });
  const id = useId();
  const background = useColorModeValue('white', 'gray.800');
  const highlight = useColorModeValue('blue.50', 'whiteAlpha.200');
  const selected = clients.find(client => client.id === value);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const filtered = clients.filter(client => {
    const text = normalize(`${clientName(client)} ${client.email || ''}`);
    return words.every(word => text.includes(word));
  });
  const close = () => { setOpen(false); setQuery(''); setActive(-1); };
  useOutsideClick({ ref: root, handler: event => { if (!list.current?.contains(event.target)) close(); } });
  const choose = client => { onChange(client.id); close(); input.current?.focus(); };
  const show = () => { setOpen(true); setQuery(''); setActive(-1); };
  const move = index => {
    setActive(index);
    requestAnimationFrame(() => document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: 'nearest' }));
  };
  return <Box ref={root} position="relative" {...props} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !list.current?.contains(event.relatedTarget)) close(); }}>
    <InputGroup ref={referenceRef}>
      <Input ref={input} role="combobox" aria-label={clubText('Choisir un client')} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 && filtered[active] ? `${id}-${active}` : undefined}
        placeholder={clubText('Choisir un client')} autoComplete="off" value={open ? query : selected ? clientName(selected) : ''} paddingRight={10}
        onClick={() => { if (!open) show(); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); close(); } }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) show();
            if (filtered.length) move(event.key === 'ArrowDown' ? Math.min(active + 1, filtered.length - 1) : active <= 0 ? filtered.length - 1 : active - 1);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            const candidate = filtered[active >= 0 ? active : 0];
            if (candidate) choose(candidate);
          } else if (event.key === 'Tab') close();
        }} />
      <InputRightElement><IconButton tabIndex={-1} size="sm" variant="ghost" aria-label={clubText('Choisir un client')} icon={<ChevronDownIcon />} onMouseDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); if (open) close(); else show(); }} /></InputRightElement>
    </InputGroup>
    {open && <Portal containerRef={portalContainerRef}><Box {...getPopperProps({}, list)} id={`${id}-list`} role="listbox" aria-label={clubText('Clients')} maxH="260px" overflowY="auto" bg={background} borderWidth="1px" borderRadius="lg" shadow="lg" zIndex="popover" py={1}>
      {filtered.map((client, index) => <Box key={client.id} id={`${id}-${index}`} role="option" aria-selected={client.id === value} px={3} py={2} cursor="pointer" bg={active === index ? highlight : undefined} _hover={{ bg: highlight }} onMouseDown={event => event.preventDefault()} onClick={() => choose(client)}>
        <Text fontWeight={client.id === value ? 'semibold' : 'normal'}>{clientName(client)}</Text>
        {client.email && <Text fontSize="xs" opacity={0.7}>{client.email}</Text>}
      </Box>)}
      {!filtered.length && <Text role="status" px={3} py={2} fontSize="sm">{clubText('Aucun client trouvé.')}</Text>}
    </Box></Portal>}
  </Box>;
}
