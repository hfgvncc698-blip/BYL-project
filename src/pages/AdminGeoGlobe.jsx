import React, { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { Badge, Box, Heading, Text } from "@chakra-ui/react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import i18n from "../i18n/index";

export default function AdminGeoGlobe() {
  const globeEl = useRef();
  const theme = useAppTheme();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "analytics_geo"));
        const arr = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (typeof d.lat === "number" && typeof d.lon === "number") {
            arr.push({
              lat: d.lat,
              lng: d.lon,
              size: Math.max(0.5, Math.log(d.pv || 1) + 1),
              city: d.city || "Unknown",
              country: d.country || "UN",
              pv: d.pv || 0,
            });
          }
        });
        if (mounted) setPoints(arr);
      } catch (e) {
        console.error("GeoGlobe error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)">
      <Box
        {...theme.cardProps}
        p={{ base: 5, md: 7 }}
        mb={6}
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 14% 8%, rgba(59,130,246,.18), transparent 34%), radial-gradient(circle at 86% 12%, rgba(16,185,129,.14), transparent 30%)",
        }}
      >
        <Box position="relative">
          <Badge borderRadius="full" px={3} mb={3}>{i18n.t("auto.AdminGeoGlobe.admin_analytics", "Admin analytics")}</Badge>
          <Heading letterSpacing="-0.05em">{i18n.t("auto.AdminGeoGlobe.globe_3d_trafic_par_villes", "Globe 3D — trafic par villes")}</Heading>
          <Text color={theme.mutedText} mt={2}>{i18n.t("auto.AdminGeoGlobe.une_lecture_immersive_des_visites_geolocalisees", "Une lecture immersive des visites géolocalisées.")}</Text>
        </Box>
      </Box>
      {loading ? (
        <AppLoading label={i18n.t("auto.AdminGeoGlobe.chargement_du_globe", "Chargement du globe...")} />
      ) : (
        <Box {...theme.cardProps} w="100%" h="700px" overflow="hidden">
          <Globe
            ref={globeEl}
            width={window.innerWidth - 100}
            height={650}
            backgroundColor="#000"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            labelsData={points}
            labelLat={(d) => d.lat}
            labelLng={(d) => d.lng}
            labelText={(d) => `${d.city} (${d.country}) : ${d.pv} vues`}
            labelSize={(d) => d.size * 1.2}
            labelDotRadius={(d) => d.size}
            labelColor={() => "rgba(0,150,255,0.75)"}
            atmosphereColor="lightskyblue"
            atmosphereAltitude={0.25}
          />
        </Box>
      )}
    </Box>
  );
}
