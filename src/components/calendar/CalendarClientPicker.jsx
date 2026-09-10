import React, { useId, useMemo, useState } from "react";
import { Box, Button, Input, Stack, Text } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";

// Keep the picker inside the modal: no native select sheet or nested portal.
export default function CalendarClientPicker({ clients, value, onChange, placeholder, t }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const options = useMemo(() => (Array.isArray(clients) ? clients : [])
    .filter(client => client && typeof client.id === "string")
    .map(client => ({ id: client.id, label: [client.prenom, client.nom]
      .filter(part => typeof part === "string").join(" ").trim() || (typeof client.email === "string" ? client.email : client.id) })), [clients]);
  const selected = options.find(option => option.id === value);
  const filtered = options.filter(option => normalize(option.label).includes(normalize(search)));
  return (
    <Box w="full" onKeyDown={event => {
      if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
    }}>
      <Button w="full" variant="outline" justifyContent="space-between" rightIcon={<ChevronDownIcon />}
        whiteSpace="normal" textAlign="left" height="auto" minH="44px" py={2}
        aria-expanded={open} aria-controls={listId}
        onClick={() => { setOpen(!open); setSearch(""); }}>
        {selected?.label || placeholder}
      </Button>
      {open && (
        <Box id={listId} borderWidth="1px" borderRadius="lg" p={2} mt={2}>
          <Input aria-label={t("calendar.client_search", "Rechercher un client")}
            placeholder={t("calendar.client_search", "Rechercher un client")}
            value={search} onChange={event => setSearch(event.target.value)} fontSize="16px" mb={2} />
          <Stack maxH="240px" overflowY="auto" spacing={1} role="group" aria-label={placeholder}
            sx={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
            {filtered.map(option => (
              <Button key={option.id} variant={option.id === value ? "solid" : "ghost"} aria-pressed={option.id === value}
                justifyContent="flex-start" whiteSpace="normal" textAlign="left" flexShrink={0} minH="44px" height="auto" py={2}
                onClick={() => { onChange(option.id); setOpen(false); setSearch(""); }}>
                {option.label}
              </Button>
            ))}
            {!filtered.length && <Text p={2} fontSize="sm">{t("calendar.no_client_match", "Aucun client trouvé")}</Text>}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
