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
  Select,
  Stack,
  Badge,
} from "@chakra-ui/react";

// ====== Carte 2D (Leaflet)
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";

// Firestore
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/* ------------------------------------ utils ------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(fmtDay(d));
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

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

// KPI card
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

const METRICS = [
  { key: "pv", label: "Pages vues" },
  { key: "uv", label: "Visiteurs uniques" }, // ✅ wording identique dashboard
];

const WINDOWS = [
  { key: "today", label: "Aujourd’hui" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "all", label: "Toujours" },
];

/* ------------------------------------ Page ------------------------------------ */
export default function AdminGeo() {
  const [loading, setLoading] = useState(true);

  // base cities from analytics_geo
  // { geoId, country, city, pv, users, lat, lon }
  const [citiesBase, setCitiesBase] = useState([]);

  // geo daily docs (analytics_geo_daily)
  // { day, geoId, country, city, pv, uniqueVisitors }
  const [geoDaily, setGeoDaily] = useState([]);

  // geo hourly docs (analytics_geo_hourly)
  // { day, hour, geoId, country, city, pv, uniqueVisitors }
  const [geoHourly, setGeoHourly] = useState([]);

  const [metric, setMetric] = useState("pv"); // pv | uv
  const [windowKey, setWindowKey] = useState("30d"); // today | 7d | 30d | all

  const [minVal, setMinVal] = useState(1);
  const [search, setSearch] = useState("");

  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const autoRanRef = useRef(false);

  const toast = useToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const bubbleFill = useColorModeValue("#3182ce", "#63b3ed");
  const bubbleStroke = useColorModeValue("#1a365d", "#2a4365");

  const todayKey = useMemo(() => fmtDay(new Date()), []);

  // Load analytics_geo + analytics_geo_daily + analytics_geo_hourly
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const [snapGeo, snapDaily, snapHourly] = await Promise.all([
          getDocs(collection(db, "analytics_geo")),
          getDocs(collection(db, "analytics_geo_daily")),
          getDocs(collection(db, "analytics_geo_hourly")),
        ]);

        const baseArr = [];
        snapGeo.forEach((d) => {
          const x = d.data() || {};
          const country = (x.country || "UN").toUpperCase();
          const city = x.city || "unknown";

          baseArr.push({
            id: d.id,
            geoId: d.id,
            country,
            city,
            pv: x.pv || 0,
            // ✅ all-time uniques per city
            usersAllTime: x.users || 0,
            lat: typeof x.lat === "number" ? x.lat : null,
            lon: typeof x.lon === "number" ? x.lon : null,
          });
        });

        const dailyArr = [];
        snapDaily.forEach((d) => {
          const x = d.data() || {};
          dailyArr.push({
            id: d.id,
            day: x.day || null,
            geoId: x.geoId || null,
            country: (x.country || "UN").toUpperCase(),
            city: x.city || "unknown",
            pv: x.pv || 0,
            uniqueVisitors: x.uniqueVisitors || 0,
          });
        });

        const hourlyArr = [];
        snapHourly.forEach((d) => {
          const x = d.data() || {};
          hourlyArr.push({
            id: d.id,
            day: x.day || null,
            hour: typeof x.hour === "number" ? x.hour : null,
            geoId: x.geoId || null,
            country: (x.country || "UN").toUpperCase(),
            city: x.city || "unknown",
            pv: x.pv || 0,
            uniqueVisitors: x.uniqueVisitors || 0,
          });
        });

        if (mounted) {
          setCitiesBase(baseArr);
          setGeoDaily(dailyArr);
          setGeoHourly(hourlyArr);
        }
      } catch (e) {
        console.error("AdminGeo fetch error:", e);
        toast({ status: "error", description: "Erreur de chargement analytics_geo / analytics_geo_daily / analytics_geo_hourly" });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [toast]);

  // Compute day set for selected window
  const daySet = useMemo(() => {
    if (windowKey === "today") return new Set([fmtDay(new Date())]);
    if (windowKey === "7d") return new Set(lastNDays(7));
    if (windowKey === "30d") return new Set(lastNDays(30));
    return null; // all-time
  }, [windowKey]);

  // Aggregate values per geoId depending on window + metric
  const aggByGeoId = useMemo(() => {
    // all-time comes from analytics_geo directly
    if (windowKey === "all") {
      const out = {};
      citiesBase.forEach((c) => {
        out[c.geoId] = metric === "pv" ? (c.pv || 0) : (c.usersAllTime || 0);
      });
      return out;
    }

    // otherwise use analytics_geo_daily
    const out = {};
    geoDaily.forEach((d) => {
      if (!d.geoId || !d.day) return;
      if (!daySet?.has(d.day)) return;

      const val = metric === "pv" ? (d.pv || 0) : (d.uniqueVisitors || 0);
      out[d.geoId] = (out[d.geoId] || 0) + val;
    });
    return out;
  }, [windowKey, metric, citiesBase, geoDaily, daySet]);

  // Merge base (coords/city) + aggregated value
  const cities = useMemo(() => {
    const arr = citiesBase.map((c) => ({
      ...c,
      value: aggByGeoId[c.geoId] || 0,
    }));
    return arr.sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [citiesBase, aggByGeoId]);

  // KPI (global)
  const kpi = useMemo(() => {
    const total = cities.reduce((a, c) => a + (c.value || 0), 0);
    const nbCities = citiesBase.length;

    const byCountry = {};
    cities.forEach((c) => {
      byCountry[c.country] = (byCountry[c.country] || 0) + (c.value || 0);
    });

    const top = Object.entries(byCountry)
      .map(([k, v]) => ({ country: k, value: v }))
      .sort((a, b) => b.value - a.value)[0];

    return {
      total,
      nbCities,
      topCountry: top?.country || "-",
      topCountryValue: top?.value || 0,
    };
  }, [cities, citiesBase.length]);

  // Filter + search
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cities
      .filter((c) => (c.value || 0) >= (minVal || 0))
      .filter((c) =>
        s
          ? (c.city || "").toLowerCase().includes(s) || (c.country || "").toLowerCase().includes(s)
          : true
      )
      .sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [cities, minVal, search]);

  const mapPoints = useMemo(
    () => filtered.filter((c) => typeof c.lat === "number" && typeof c.lon === "number"),
    [filtered]
  );

  // Dernière heure active aujourd’hui par ville (selon métrique)
  const lastHourByGeoIdToday = useMemo(() => {
    const out = {}; // geoId -> { lastHour, lastValue }
    geoHourly.forEach((h) => {
      if (!h.geoId || !h.day || h.hour == null) return;
      if (h.day !== todayKey) return;

      const val = metric === "pv" ? (h.pv || 0) : (h.uniqueVisitors || 0);
      if (val <= 0) return;

      const prev = out[h.geoId];
      if (!prev || h.hour > prev.lastHour) {
        out[h.geoId] = { lastHour: h.hour, lastValue: val };
      }
    });
    return out;
  }, [geoHourly, todayKey, metric]);

  // Eligible for geocoding
  const eligibleToGeocode = (c) =>
    (c.lat == null || c.lon == null) &&
    c.country &&
    c.country !== "UN" &&
    c.city &&
    String(c.city).toLowerCase() !== "unknown";

  // Enrich coords
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
    const updated = [...citiesBase];

    const batch = source === "auto" ? Math.min(missing.length, 30) : missing.length;
    const toProcess = missing.slice(0, batch);

    for (const city of toProcess) {
      try {
        const res = await geocodeCity(city.country, city.city);
        if (res) {
          await updateDoc(doc(db, "analytics_geo", city.geoId), {
            lat: res.lat,
            lon: res.lon,
            updatedAt: new Date().toISOString(),
          });
          const idx = updated.findIndex((c) => c.geoId === city.geoId);
          if (idx >= 0) updated[idx] = { ...updated[idx], lat: res.lat, lon: res.lon };
        }
      } catch (e) {
        console.warn("geocode error", city, e);
      } finally {
        done += 1;
        setProgress(Math.round((done / toProcess.length) * 100));
        await sleep(1100);
      }
    }

    setCitiesBase(updated);
    setEnriching(false);

    if (source === "manual") {
      toast({ status: "success", description: "Enrichissement terminé." });
    }
  };

  // Auto-run once
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
  }, [loading, autoEnrich, filtered]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label || "Pages vues";
  const windowLabel = WINDOWS.find((w) => w.key === windowKey)?.label || "30 jours";

  const maxVal = useMemo(() => {
    const m = Math.max(1, ...cities.map((c) => c.value || 0));
    return Math.max(10, Math.ceil(m));
  }, [cities]);

  // ✅ label UI clarifié pour la fenêtre "Toujours" en visiteurs uniques
  const metricLabelUi = useMemo(() => {
    if (metric !== "uv") return "Pages vues";
    return windowKey === "all" ? "Visiteurs uniques (toujours)" : "Visiteurs uniques";
  }, [metric, windowKey]);

  return (
    <Box p={6}>
      <Heading mb={6}>Géographie — trafic par villes</Heading>

      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={6}>
        <StatCard
          title={`${metricLabelUi} (global)`}
          value={kpi.total}
          help={windowLabel}
        />
        <StatCard title="Villes suivies" value={kpi.nbCities} help="docs uniques" />
        <StatCard
          title="Pays top"
          value={kpi.topCountry}
          help={`${kpi.topCountryValue} ${metric === "pv" ? "vues" : (windowKey === "all" ? "uniques (toujours)" : "visiteurs uniques")}`}
        />

        <Card bg={cardBg} borderRadius="xl" shadow="sm">
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <Box>
                <Text fontSize="sm" color="gray.500" mb={1}>Métrique</Text>
                <Select
                  value={metric}
                  onChange={(e) => { setMetric(e.target.value); setMinVal(1); }}
                >
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </Select>
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.500" mb={1}>Fenêtre</Text>
                <Select
                  value={windowKey}
                  onChange={(e) => { setWindowKey(e.target.value); setMinVal(1); }}
                >
                  {WINDOWS.map((w) => (
                    <option key={w.key} value={w.key}>{w.label}</option>
                  ))}
                </Select>
              </Box>
            </SimpleGrid>

            {/* ✅ Clarification sémantique */}
            {metric === "uv" && windowKey === "all" && (
              <Box mt={3}>
                <Badge colorScheme="purple" variant="subtle">
                  “Toujours” = uniques all-time par ville (analytics_geo.users)
                </Badge>
              </Box>
            )}
            {metric === "uv" && windowKey !== "all" && (
              <Box mt={3}>
                <Badge colorScheme="blue" variant="subtle">
                  {windowLabel} = somme des uniques journaliers (analytics_geo_daily.uniqueVisitors)
                </Badge>
              </Box>
            )}

            <HStack spacing={3} mt={4}>
              <Tag size="md">
                Filtre ≥ {minVal} {metric === "pv" ? "PV" : (windowKey === "all" ? "uniques" : "visiteurs uniques")}
              </Tag>
              <Slider
                aria-label="min-val"
                min={1}
                max={maxVal}
                value={minVal}
                onChange={setMinVal}
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
              <Button onClick={() => { setSearch(""); setMinVal(1); }}>
                Réinitialiser
              </Button>
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

            {/* Petit rappel heure locale */}
            <Box mt={3}>
              <Badge colorScheme="gray" variant="subtle">
                Heures = heure locale du visiteur (analytics_geo_hourly)
              </Badge>
            </Box>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* ------------------------------ Carte 2D ------------------------------ */}
      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between" align="center">
            <Heading size="md">
              Carte — {metricLabelUi} ({windowLabel})
            </Heading>
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
                  const v = Math.max(1, c.value || 0);
                  const r = Math.max(4, Math.sqrt(v) * 2.2);

                  const label =
                    metric === "pv"
                      ? `${c.value} vues`
                      : (windowKey === "all"
                          ? `${c.value} uniques (toujours)`
                          : `${c.value} visiteurs uniques`);

                  const last = lastHourByGeoIdToday[c.geoId];

                  return (
                    <CircleMarker
                      key={c.geoId}
                      center={[c.lat, c.lon]}
                      radius={r}
                      pathOptions={{
                        color: bubbleStroke,
                        weight: 1,
                        fillColor: bubbleFill,
                        fillOpacity: 0.75,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -2]}>
                        <strong>{c.city}</strong> ({c.country}) — {label}
                        <br />
                        <span style={{ opacity: 0.85 }}>
                          Dernière activité aujourd’hui : {last ? `${pad2(last.lastHour)}h` : "—"}
                        </span>
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
          <HStack justify="space-between" align="center">
            <Heading size="md">Top villes</Heading>
            <Tag>
              {metricLabelUi} • {windowLabel}
            </Tag>
          </HStack>
        </CardHeader>

        <CardBody>
          <Table size="sm" variant="striped">
            <Thead>
              <Tr>
                <Th>Ville</Th>
                <Th>Pays</Th>
                <Th isNumeric>
                  {metric === "pv"
                    ? "PV"
                    : (windowKey === "all" ? "Uniques (toujours)" : "Visiteurs uniques")}
                </Th>
                <Th>Dernière heure (aujourd’hui)</Th>
                <Th>Coordonnées</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.slice(0, 50).map((c) => {
                const last = lastHourByGeoIdToday[c.geoId];
                return (
                  <Tr key={c.geoId}>
                    <Td>{c.city}</Td>
                    <Td>{c.country}</Td>
                    <Td isNumeric>{c.value}</Td>
                    <Td>
                      {last
                        ? (
                          <Text as="span">
                            {pad2(last.lastHour)}h
                            <Text as="span" color="gray.500"> (</Text>
                            <Text as="span" color="gray.500">
                              {metric === "pv" ? `${last.lastValue} PV` : `${last.lastValue} uniques`}
                            </Text>
                            <Text as="span" color="gray.500">)</Text>
                          </Text>
                        )
                        : <Text as="span" color="gray.500">—</Text>}
                    </Td>
                    <Td>
                      {typeof c.lat === "number" && typeof c.lon === "number"
                        ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`
                        : <Text as="span" color="gray.500">— à géocoder —</Text>}
                    </Td>
                  </Tr>
                );
              })}
              {filtered.length === 0 && (
                <Tr><Td colSpan={5} color="gray.500">Aucune donnée.</Td></Tr>
              )}
            </Tbody>
          </Table>

          <Stack spacing={1} mt={3}>
            <Text color="gray.500" fontSize="sm">
              L’enrichissement écrit <code>lat</code>/<code>lon</code> dans <code>analytics_geo</code> (une fois pour toutes).
            </Text>
            <Text color="gray.500" fontSize="sm">
              Aujourd’hui/7j/30j utilisent <code>analytics_geo_daily</code> (PV + <code>uniqueVisitors</code> par ville et par jour).
            </Text>
            <Text color="gray.500" fontSize="sm">
              Toujours utilise <code>analytics_geo.pv</code> et <code>analytics_geo.users</code> (uniques all-time par ville).
            </Text>
            <Text color="gray.500" fontSize="sm">
              Heures (aujourd’hui) utilisent <code>analytics_geo_hourly</code> (PV + <code>uniqueVisitors</code> par ville et par heure).
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Box>
  );
}

