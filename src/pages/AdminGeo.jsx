// src/pages/AdminGeo.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  HStack,
  Input,
  Tag,
  Spinner,
  useColorModeValue,
  Text,
  Button,
  Progress,
  useToast,
  Switch,
  FormControl,
  FormLabel,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from "@chakra-ui/react";

// ====== Carte 2D (Leaflet)
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";

// ====== Globe 3D
import Globe from "react-globe.gl";

// Firestore
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/* ------------------------------------ utils ------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Geocoding (Nominatim / OSM)
async function geocodeCity(countryISO2, city) {
  const params = new URLSearchParams({
    city: city,
    countrycodes: (countryISO2 || "").toLowerCase(),
    format: "json",
    limit: "1",
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocode failed ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const best = data[0];
  const lat = parseFloat(best.lat);
  const lon = parseFloat(best.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

// Fit map to markers
function FitToMarkers({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.reduce(
      (acc, p) => acc.extend([p.lat, p.lon]),
      window.L.latLngBounds([points[0].lat, points[0].lon])
    );
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [points, map]);
  return null;
}

// Petit composant KPI
function StatCard({ title, value, help }) {
  const cardBg = useColorModeValue("white", "gray.800");
  return (
    <Stat p={4} bg={cardBg} borderRadius="xl" shadow="sm">
      <StatLabel>{title}</StatLabel>
      <StatNumber>{value}</StatNumber>
      {help && <StatHelpText>{help}</StatHelpText>}
    </Stat>
  );
}

/* ------------------------------------ Page ------------------------------------ */
export default function AdminGeo() {
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState([]); // {id,country,city,pv,lat,lon}
  const [minPv, setMinPv] = useState(1);
  const [search, setSearch] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoEnrich, setAutoEnrich] = useState(true); // auto à l’ouverture
  const autoRanRef = useRef(false);
  const toast = useToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const bubbleFill = useColorModeValue("#3182ce", "#63b3ed");
  const bubbleStroke = useColorModeValue("#1a365d", "#2a4365");

  // charge analytics_geo
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "analytics_geo"));
        const arr = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          arr.push({
            id: d.id,
            country: (x.country || "UN").toUpperCase(),
            city: x.city || "Unknown",
            pv: x.pv || 0,
            lat: typeof x.lat === "number" ? x.lat : null,
            lon: typeof x.lon === "number" ? x.lon : null,
          });
        });
        if (mounted) setCities(arr.sort((a, b) => b.pv - a.pv));
      } catch (e) {
        console.error("analytics_geo fetch error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  // KPIs
  const kpi = useMemo(() => {
    const totalPv = cities.reduce((a, c) => a + (c.pv || 0), 0);
    const nbCities = cities.length;
    const byCountry = {};
    cities.forEach((c) => (byCountry[c.country] = (byCountry[c.country] || 0) + (c.pv || 0)));
    const top = Object.entries(byCountry)
      .map(([k, v]) => ({ country: k, pv: v }))
      .sort((a, b) => b.pv - a.pv)[0];
    return { totalPv, nbCities, topCountry: top?.country || "-", topCountryPv: top?.pv || 0 };
  }, [cities]);

  // Filtrage
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cities
      .filter((c) => (c.pv || 0) >= (minPv || 0))
      .filter((c) => (s ? (c.city || "").toLowerCase().includes(s) || c.country.toLowerCase().includes(s) : true))
      .sort((a, b) => b.pv - a.pv);
  }, [cities, minPv, search]);

  const mapPoints = useMemo(
    () => filtered.filter((c) => typeof c.lat === "number" && typeof c.lon === "number"),
    [filtered]
  );

  // Eligibilité géocodage
  const eligibleToGeocode = (c) =>
    (c.lat == null || c.lon == null) &&
    c.country &&
    c.country !== "UN" &&
    c.city &&
    c.city.toLowerCase() !== "unknown";

  // Enrichissement (manuel / auto)
  const enrichMissingCoords = async (source = "manual") => {
    const missing = filtered.filter(eligibleToGeocode);
    if (missing.length === 0) {
      if (source === "manual") {
        toast({ status: "success", description: "Toutes les villes affichées ont des coordonnées." });
      }
      return;
    }

    setEnriching(true);
    setProgress(0);

    let done = 0;
    const updated = [...cities];

    // en auto, on limite la première passe pour respecter Nominatim si la liste est longue
    const batch = source === "auto" ? Math.min(missing.length, 30) : missing.length;
    const toProcess = missing.slice(0, batch);

    for (const city of toProcess) {
      try {
        const res = await geocodeCity(city.country, city.city);
        if (res) {
          await updateDoc(doc(db, "analytics_geo", city.id), {
            lat: res.lat,
            lon: res.lon,
            updatedAt: new Date().toISOString(),
          });
          const idx = updated.findIndex((c) => c.id === city.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], lat: res.lat, lon: res.lon };
        }
      } catch (e) {
        console.warn("geocode error", city, e);
      } finally {
        done += 1;
        setProgress(Math.round((done / toProcess.length) * 100));
        await sleep(1100); // ~1 req/s recommandé
      }
    }

    setCities(updated);
    setEnriching(false);

    if (source === "manual") {
      toast({ status: "success", description: "Enrichissement terminé." });
    }
  };

  // Auto-run une seule fois si activé
  useEffect(() => {
    if (loading) return;
    if (autoRanRef.current) return;
    if (!autoEnrich) return;
    const hasMissingEligible = filtered.some(eligibleToGeocode);
    if (!hasMissingEligible) {
      autoRanRef.current = true;
      return;
    }
    autoRanRef.current = true;
    enrichMissingCoords("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, autoEnrich]);

  /* ------------------------------------ UI ------------------------------------ */
  return (
    <Box p={6}>
      <Heading mb={6}>Géographie — trafic par villes</Heading>

      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={6}>
        <StatCard title="Vues globales" value={kpi.totalPv} help="analytics_geo" />
        <StatCard title="Villes suivies" value={kpi.nbCities} help="docs uniques" />
        <StatCard title="Pays top" value={kpi.topCountry} help={`${kpi.topCountryPv} vues`} />
        <Card bg={cardBg} borderRadius="xl" shadow="sm">
          <CardBody>
            <HStack spacing={3}>
              <Tag size="md">Filtre PV ≥ {minPv}</Tag>
              <Slider
                aria-label="min-pv"
                min={1}
                max={Math.max(10, Math.ceil(Math.max(1, ...cities.map((c) => c.pv || 0))))}
                value={minPv}
                onChange={setMinPv}
              >
                <SliderTrack><SliderFilledTrack /></SliderTrack>
                <SliderThumb />
              </Slider>
            </HStack>
            <HStack mt={3}>
              <Input
                placeholder="Recherche ville ou pays (ISO2)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button onClick={() => { setSearch(""); setMinPv(1); }}>Réinitialiser</Button>
            </HStack>
            <FormControl display="flex" alignItems="center" mt={4}>
              <FormLabel htmlFor="auto-enrich" mb="0">Auto-géocoder à l’ouverture</FormLabel>
              <Switch
                id="auto-enrich"
                isChecked={autoEnrich}
                onChange={(e) => setAutoEnrich(e.target.checked)}
                colorScheme="blue"
              />
            </FormControl>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Tabs variant="enclosed" colorScheme="blue">
        <TabList>
          <Tab>Carte 2D</Tab>
          <Tab>Globe 3D</Tab>
        </TabList>

        <TabPanels>
          {/* ------------------------------ Carte 2D ------------------------------ */}
          <TabPanel>
            <Card mb={6}>
              <CardHeader>
                <HStack justify="space-between" align="center">
                  <Heading size="md">Carte</Heading>
                  <HStack>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => enrichMissingCoords("manual")}
                      isLoading={enriching}
                      loadingText="Enrichissement…"
                    >
                      Enrichir coordonnées (admin)
                    </Button>
                  </HStack>
                </HStack>
              </CardHeader>
              <CardBody>
                {enriching && <Progress value={progress} size="sm" mb={3} />}
                {loading ? (
                  <Box py={10} textAlign="center"><Spinner /></Box>
                ) : (
                  <Box w="100%" h={{ base: "420px", md: "560px" }} borderRadius="lg" overflow="hidden">
                    <MapContainer
                      style={{ width: "100%", height: "100%" }}
                      center={[20, 0]}
                      zoom={2}
                      minZoom={2}
                      worldCopyJump
                      preferCanvas
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      />
                      <FitToMarkers points={mapPoints} />
                      {mapPoints.map((c) => {
                        const r = Math.max(4, Math.sqrt(Math.max(1, c.pv)) * 2.2);
                        return (
                          <CircleMarker
                            key={c.id}
                            center={[c.lat, c.lon]}
                            radius={r}
                            pathOptions={{ color: bubbleStroke, weight: 1, fillColor: bubbleFill, fillOpacity: 0.75 }}
                          >
                            <Tooltip direction="top" offset={[0, -2]}>
                              <strong>{c.city}</strong> ({c.country}) — {c.pv} vues
                            </Tooltip>
                          </CircleMarker>
                        );
                      })}
                    </MapContainer>
                  </Box>
                )}
              </CardBody>
            </Card>

            {/* Tableau Top villes */}
            <Card>
              <CardHeader>
                <Heading size="md">Top villes</Heading>
              </CardHeader>
              <CardBody>
                <Table size="sm" variant="striped">
                  <Thead>
                    <Tr>
                      <Th>Ville</Th>
                      <Th>Pays</Th>
                      <Th isNumeric>PV</Th>
                      <Th>Coordonnées</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((c) => (
                      <Tr key={c.id}>
                        <Td>{c.city}</Td>
                        <Td>{c.country}</Td>
                        <Td isNumeric>{c.pv}</Td>
                        <Td>
                          {typeof c.lat === "number" && typeof c.lon === "number"
                            ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`
                            : <Text as="span" color="gray.500">— à géocoder —</Text>}
                        </Td>
                      </Tr>
                    ))}
                    {filtered.length === 0 && (
                      <Tr><Td colSpan={4} color="gray.500">Aucune donnée.</Td></Tr>
                    )}
                  </Tbody>
                </Table>
                <Text mt={3} color="gray.500" fontSize="sm">
                  L’enrichissement écrit <code>lat</code>/<code>lon</code> dans chaque doc <code>analytics_geo</code>
                  (une fois pour toutes). Le mode auto ne lance qu’une passe limitée pour respecter Nominatim.
                </Text>
              </CardBody>
            </Card>
          </TabPanel>

          {/* ------------------------------ Globe 3D ------------------------------ */}
          <TabPanel>
            <Card>
              <CardHeader>
                <Heading size="md">Globe 3D</Heading>
              </CardHeader>
              <CardBody>
                {loading ? (
                  <Box py={10} textAlign="center"><Spinner /></Box>
                ) : (
                  <Box w="100%" h="680px">
                    <Globe
                      width={undefined}   // s’adapte au conteneur
                      height={undefined}
                      backgroundColor={useColorModeValue("#f8fafc", "#0b1220")}
                      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                      // Utilise uniquement les points géocodés
                      labelsData={mapPoints.map((c) => ({
                        lat: c.lat,
                        lng: c.lon,
                        city: c.city,
                        country: c.country,
                        pv: c.pv,
                        size: Math.max(0.6, Math.log(c.pv || 1) + 0.8),
                      }))}
                      labelLat={(d) => d.lat}
                      labelLng={(d) => d.lng}
                      labelText={(d) => `${d.city} (${d.country}) : ${d.pv} vues`}
                      labelSize={(d) => d.size * 1.2}
                      labelDotRadius={(d) => d.size}
                      labelColor={() => "rgba(0,150,255,0.8)"}
                      atmosphereColor="lightskyblue"
                      atmosphereAltitude={0.25}
                    />
                  </Box>
                )}
                {mapPoints.length === 0 && !loading && (
                  <Text mt={3} color="gray.500">Pas encore de villes géocodées. Clique sur “Enrichir coordonnées (admin)” dans l’onglet Carte 2D.</Text>
                )}
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

