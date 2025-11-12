import React, { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { Box, Heading, Spinner } from "@chakra-ui/react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

export default function AdminGeoGlobe() {
  const globeEl = useRef();
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
    <Box p={6}>
      <Heading mb={4}>Globe 3D — trafic par villes</Heading>
      {loading ? (
        <Box textAlign="center" py={10}>
          <Spinner />
        </Box>
      ) : (
        <Box w="100%" h="700px">
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

