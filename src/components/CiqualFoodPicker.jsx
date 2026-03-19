import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Badge,
  HStack,
  VStack,
  Text,
  Input,
  Spinner,
  Checkbox,
  SimpleGrid,
  useToast,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Collapse,
  useColorModeValue,
  Select,
  Stack,
  Divider,
  useBreakpointValue,
  Flex,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";

/* ================= Utils ================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;

const normalize = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toGrams = (qty, unit) => {
  const q = num(qty);
  if (!q) return 0;
  if (unit === "g" || unit === "ml") return q;
  return 0;
};

const pretty = (k) =>
  k
    .replace(/_100g$/i, "")
    .replace(/_/g, " ")
    .toUpperCase();

/* ✅ Ajustements mobile/desktop : TOTALS comme "RAPPEL" (sticky, pas fixed) */
const RAPPEL_H_MOBILE = 110; // hauteur approx de la barre rappel FoodSurvey
const SAFE_AREA_PX = 18; // ✅ plus haut pour éviter le cut du bas des lettres
const DESKTOP_BOTTOM_TOTAL_STICKY = 74; // au-dessus du rappel desktop

/* ===== Formatters (sans tirets) ===== */
const fmt0Plain = (v) => String(r0(v));
const fmt1Plain = (v) => String(r1(v));

/* ================= Component ================= */
export default function CiqualFoodPicker({ blocked, initialState, onChange }) {
  const toast = useToast();
  const mounted = useRef(false);

  /* ===== Theme ===== */
  const bgCard = useColorModeValue("white", "gray.900");
  const bgSoft = useColorModeValue("gray.50", "gray.800");
  const bgHover = useColorModeValue("gray.100", "gray.700");
  const border = useColorModeValue("gray.200", "gray.700");
  const textMuted = useColorModeValue("gray.600", "gray.400");

  /* ===== Responsive ===== */
  const isMobile = useBreakpointValue({ base: true, md: false });

  /* ✅ Totaux: sticky sur tous les écrans (comme NeedsReminderBar) */
  const totalsPosition = "sticky";
  const totalsBottom = useBreakpointValue({
    base: `calc(${RAPPEL_H_MOBILE}px + env(safe-area-inset-bottom) + ${SAFE_AREA_PX}px)`,
    md: `${DESKTOP_BOTTOM_TOTAL_STICKY}px`,
  });

  /* ✅ Padding bottom pour que le contenu ne soit jamais masqué sur mobile */
  const pagePb = useBreakpointValue({
    base: `${RAPPEL_H_MOBILE + 200}px`,
    md: "0px",
  });

  /* ===== State ===== */
  const [ciqual, setCiqual] = useState([]);
  const [byCode, setByCode] = useState({});
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialState?.items || []);
  const [nutrientsOpen, setNutrientsOpen] = useState(false);
  const [selectedNutrients, setSelectedNutrients] = useState(
    initialState?.selectedNutrients || {}
  );

  /* ✅ Mobile: détails totaux en collapse (comme ton TOTAL JOUR) */
  const [showTotalDetails, setShowTotalDetails] = useState(false);

  /* ===== Load CIQUAL ===== */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
        const data = await res.json();
        const map = {};
        data.forEach((r) => (map[r.code] = r));
        setCiqual(data);
        setByCode(map);
      } catch (e) {
        toast({
          title: "CIQUAL",
          description: "Erreur de chargement",
          status: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    onChange?.({ items, selectedNutrients });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedNutrients]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  /* ===== Nutrients keys ===== */
  const allNutrientKeys = useMemo(() => {
    return Object.keys(ciqual?.[0]?.nutrients || {}).sort();
  }, [ciqual]);

  const selectedKeys = useMemo(() => {
    return Object.keys(selectedNutrients).filter((k) => selectedNutrients[k]);
  }, [selectedNutrients]);

  const results = useMemo(() => {
    if (!query) return [];
    const q = normalize(query);
    return ciqual.filter((r) => normalize(r.name).includes(q)).slice(0, 25);
  }, [query, ciqual]);

  const addFood = (row) => {
    if (!row?.code) return;
    setItems((prev) => {
      if (prev.find((i) => i.code === row.code)) return prev;
      return [...prev, { code: row.code, name: row.name, qty: 100, unit: "g" }];
    });
    setQuery("");
  };

  const updateItem = (code, patch) => {
    setItems((prev) => prev.map((x) => (x.code === code ? { ...x, ...patch } : x)));
  };

  const removeItem = (code) => {
    setItems((prev) => prev.filter((x) => x.code !== code));
  };

  const totals = useMemo(() => {
    const t = { kcal: 0, prot: 0, lip: 0, glu: 0, micros: {} };

    items.forEach((it) => {
      const row = byCode[it.code];
      if (!row) return;
      const f = toGrams(it.qty, it.unit) / 100;
      const n = row.nutrients || {};

      t.kcal += num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f;
      t.prot +=
        num(n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g) * f;
      t.lip += num(n.lipides_g_100g) * f;
      t.glu += num(n.glucides_g_100g) * f;

      selectedKeys.forEach((k) => {
        t.micros[k] = (t.micros[k] || 0) + num(n[k]) * f;
      });
    });

    return t;
  }, [items, selectedKeys, byCode]);

  return (
    <Box pb={pagePb}>
      {/* ===== SEARCH ===== */}
      <Box bg={bgCard} border="1px solid" borderColor={border} p={4} rounded="lg">
        <Text fontWeight="800" mb={2}>
          Recherche (top 25)
        </Text>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un aliment…"
          isDisabled={blocked}
        />

        {loading && (
          <HStack mt={2} spacing={2}>
            <Spinner size="sm" />
            <Text fontSize="sm" color={textMuted}>
              Chargement CIQUAL…
            </Text>
          </HStack>
        )}

        {results.length > 0 && (
          <Box mt={3} border="1px solid" borderColor={border} rounded="md" overflow="hidden">
            {results.map((r) => (
              <Box
                key={r.code}
                px={4}
                py={3}
                cursor="pointer"
                _hover={{ bg: bgHover }}
                onPointerDown={() => addFood(r)}
              >
                <Text fontWeight="600" noOfLines={2}>
                  {r.name}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* ===== NUTRIENTS PICKER ===== */}
      <Box mt={4} bg={bgCard} border="1px solid" borderColor={border} p={4} rounded="lg">
        <Flex
          direction={{ base: "column", sm: "row" }}
          align={{ base: "stretch", sm: "center" }}
          justify="space-between"
          gap={3}
        >
          <Text fontWeight="800">Colonnes affichées (nutriments)</Text>

          <Flex gap={2} wrap="wrap" justify={{ base: "flex-start", sm: "flex-end" }}>
            <Button size="xs" onClick={() => setNutrientsOpen((v) => !v)}>
              {nutrientsOpen ? "Fermer" : "Ouvrir"}
            </Button>

            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const next = {};
                allNutrientKeys.forEach((k) => (next[k] = true));
                setSelectedNutrients(next);
              }}
            >
              Tout cocher
            </Button>

            <Button size="xs" variant="outline" onClick={() => setSelectedNutrients({})}>
              Tout décocher
            </Button>
          </Flex>
        </Flex>

        <Collapse in={nutrientsOpen}>
          <Box
            mt={3}
            maxH={{ base: "200px", md: "260px" }}
            overflowY="auto"
            bg={bgSoft}
            p={3}
            rounded="md"
            border="1px solid"
            borderColor={border}
          >
            <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} spacing={2}>
              {allNutrientKeys.map((k) => (
                <Checkbox
                  key={k}
                  isChecked={!!selectedNutrients[k]}
                  onChange={() =>
                    setSelectedNutrients((p) => ({
                      ...p,
                      [k]: !p[k],
                    }))
                  }
                >
                  <Text fontSize="sm" noOfLines={1} title={pretty(k)}>
                    {pretty(k)}
                  </Text>
                </Checkbox>
              ))}
            </SimpleGrid>
          </Box>
        </Collapse>
      </Box>

      {/* ===== ITEMS: Mobile cards / Desktop table ===== */}
      {isMobile ? (
        <VStack
          mt={4}
          spacing={3}
          align="stretch"
          bg={bgCard}
          border="1px solid"
          borderColor={border}
          rounded="lg"
          p={3}
        >
          {items.length === 0 ? (
            <Text color={textMuted} px={1}>
              Ajoute un aliment via la recherche.
            </Text>
          ) : (
            items.map((it) => {
              const row = byCode[it.code];
              const f = toGrams(it.qty, it.unit) / 100;
              const n = row?.nutrients || {};

              const kcal = r1(num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f);
              const prot = r1(
                num(n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g) * f
              );
              const lip = r1(num(n.lipides_g_100g) * f);
              const glu = r1(num(n.glucides_g_100g) * f);

              return (
                <Box
                  key={it.code}
                  border="1px solid"
                  borderColor={border}
                  rounded="lg"
                  p={3}
                  bg={bgSoft}
                  overflow="hidden"
                >
                  <HStack justify="space-between" align="start">
                    <Text fontWeight="800" lineHeight="1.2" pr={2} noOfLines={2}>
                      {it.name}
                    </Text>
                    <IconButton
                      size="sm"
                      icon={<CloseIcon />}
                      aria-label="Supprimer"
                      onClick={() => removeItem(it.code)}
                      flexShrink={0}
                    />
                  </HStack>

                  <Stack direction={{ base: "column", sm: "row" }} spacing={2} mt={3}>
                    <Box flex="1" minW={0}>
                      <Text fontSize="xs" color={textMuted} mb={1}>
                        Quantité
                      </Text>
                      <Input
                        value={it.qty}
                        onChange={(e) => updateItem(it.code, { qty: e.target.value })}
                        isDisabled={blocked}
                        inputMode="decimal"
                      />
                    </Box>
                    <Box w={{ base: "100%", sm: "140px" }} minW={0}>
                      <Text fontSize="xs" color={textMuted} mb={1}>
                        Unité
                      </Text>
                      <Select
                        value={it.unit}
                        onChange={(e) => updateItem(it.code, { unit: e.target.value })}
                        isDisabled={blocked}
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                      </Select>
                    </Box>
                  </Stack>

                  <Divider my={3} borderColor={border} />

                  <SimpleGrid columns={4} spacing={2}>
                    <Box minW={0}>
                      <Text fontSize="xs" color={textMuted}>
                        KCAL
                      </Text>
                      <Text fontWeight="800">{kcal}</Text>
                    </Box>
                    <Box minW={0}>
                      <Text fontSize="xs" color={textMuted}>
                        PROT
                      </Text>
                      <Text fontWeight="800">{prot}</Text>
                    </Box>
                    <Box minW={0}>
                      <Text fontSize="xs" color={textMuted}>
                        LIP
                      </Text>
                      <Text fontWeight="800">{lip}</Text>
                    </Box>
                    <Box minW={0}>
                      <Text fontSize="xs" color={textMuted}>
                        GLUC
                      </Text>
                      <Text fontWeight="800">{glu}</Text>
                    </Box>
                  </SimpleGrid>
                </Box>
              );
            })
          )}
        </VStack>
      ) : (
        <Box mt={4} bg={bgCard} border="1px solid" borderColor={border} rounded="lg" overflowX="auto">
          <Table size="sm">
            <Thead bg={bgSoft}>
              <Tr>
                <Th minW="280px">ALIMENT</Th>
                <Th minW="120px">QTÉ</Th>
                <Th minW="110px">UNITÉ</Th>
                <Th isNumeric>KCAL</Th>
                <Th isNumeric>PROT</Th>
                <Th isNumeric>LIP</Th>
                <Th isNumeric>GLUC</Th>
                {selectedKeys.map((k) => (
                  <Th key={k} isNumeric>
                    {pretty(k)}
                  </Th>
                ))}
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {items.map((it) => {
                const r = byCode[it.code];
                const f = toGrams(it.qty, it.unit) / 100;
                const n = r?.nutrients || {};
                return (
                  <Tr key={it.code}>
                    <Td minW="280px">{it.name}</Td>
                    <Td minW="120px">
                      <Input
                        value={it.qty}
                        onChange={(e) => updateItem(it.code, { qty: e.target.value })}
                        isDisabled={blocked}
                        inputMode="decimal"
                      />
                    </Td>
                    <Td minW="110px">
                      <Select
                        value={it.unit}
                        onChange={(e) => updateItem(it.code, { unit: e.target.value })}
                        isDisabled={blocked}
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                      </Select>
                    </Td>
                    <Td isNumeric>{r1(num(n.energie_reglement_ue_n_1169_2011_kcal_100g) * f)}</Td>
                    <Td isNumeric>
                      {r1(
                        num(
                          n.proteines_n_x_facteur_de_jones_g_100g ??
                            n.proteines_n_x_6_25_g_100g
                        ) * f
                      )}
                    </Td>
                    <Td isNumeric>{r1(num(n.lipides_g_100g) * f)}</Td>
                    <Td isNumeric>{r1(num(n.glucides_g_100g) * f)}</Td>
                    {selectedKeys.map((k) => (
                      <Td key={k} isNumeric>
                        {r1(num(n[k]) * f)}
                      </Td>
                    ))}
                    <Td>
                      <IconButton
                        size="sm"
                        icon={<CloseIcon />}
                        aria-label="Supprimer"
                        onClick={() => removeItem(it.code)}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      )}

      {/* ✅ ===== TOTALS (sticky comme "Rappel" + plus lisible + pas de tirets) ===== */}
      <Box
        mt={4}
        p={3}
        border="1px solid"
        borderColor={border}
        rounded="lg"
        bg={bgCard}
        position={totalsPosition}
        bottom={totalsBottom}
        zIndex={10}
        boxShadow="sm"
      >
        <HStack align="start" spacing={3}>
          <Box flex="1" minW={0}>
            <Text fontWeight="900" letterSpacing="0.02em">
              TOTAL JOUR
            </Text>

            <Text mt={1} fontWeight="900" fontSize={isMobile ? "sm" : "md"} lineHeight="1.25">
              {fmt0Plain(totals.kcal)} kcal • {fmt0Plain(totals.prot)} g prot •{" "}
              {fmt0Plain(totals.lip)} g lip • {fmt0Plain(totals.glu)} g gluc
            </Text>
          </Box>

          {isMobile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTotalDetails((v) => !v)}
              flexShrink={0}
            >
              {showTotalDetails ? "Masquer" : "Détails"}
            </Button>
          )}
        </HStack>

        <Collapse in={!isMobile || showTotalDetails} animateOpacity>
          <Box mt={3}>
            {Object.keys(totals.micros || {}).length === 0 ? (
              <Text fontSize="sm" color={textMuted}>
                Sélectionne des nutriments pour afficher les micros.
              </Text>
            ) : (
              <Wrap spacing={2}>
                {Object.entries(totals.micros).map(([k, v]) => (
                  <WrapItem key={k}>
                    <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="md">
                      {pretty(k)} : {fmt1Plain(v)}
                    </Badge>
                  </WrapItem>
                ))}
              </Wrap>
            )}

            {items.length === 0 && (
              <Text mt={2} fontSize="sm" color={textMuted}>
                Ajoute un aliment via la recherche pour calculer les totaux.
              </Text>
            )}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}

