// src/hooks/useGeolocation.js
import { useState, useEffect, useRef } from "react";
import { db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { saveAnalyticsGeo } from "../analytics/analyticsStore";
import { resolveCityCountry } from "../utils/geocoding";

/**
 * useGeolocation({
 *   uid: string|null,
 *   enabled: boolean,
 *   watch: boolean,
 *   options?: GeolocationPositionOptions,
 *   saveUserLocation: boolean, // écrit users/{uid}.location (si uid && true)
 *   saveAnalytics: boolean      // incrémente analytics_geo/{COUNTRY-city}
 * })
 */
export default function useGeolocation({
  uid = null,
  enabled = true,
  watch = false,
  options,
  saveUserLocation = false,
  saveAnalytics = false,
} = {}) {
  const [state, setState] = useState({
    status: "idle", // idle | requesting | granted | denied | unsupported
    position: null, // {lat,lng,accuracy,timestamp,source}
    error: null,
  });
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    if (!("geolocation" in navigator)) {
      setState({
        status: "unsupported",
        position: null,
        error: new Error("Geolocation not supported"),
      });
      return;
    }

    const success = async (pos) => {
      const base = {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp || Date.now(),
        source: "browser",
      };

      setState({ status: "granted", position: base, error: null });

      // 1) USERS/{uid}.location — si demandé & autorisé
      if (uid && saveUserLocation) {
        try {
          const ref = doc(db, "users", uid);
          await setDoc(
            ref,
            { location: { ...base, updatedAt: serverTimestamp() } },
            { merge: true }
          );
        } catch (err) {
          console.error("Failed to save user location:", err);
        }
      }

      // 2) analytics_geo — si demandé
      if (saveAnalytics) {
        try {
          let cityCountry = await resolveCityCountry(base.lat, base.lng);
          if (!cityCountry) cityCountry = { city: null, country: null }; // UN-unknown
          await saveAnalyticsGeo(cityCountry);
        } catch (err) {
          console.error("Failed to save analytics geo:", err);
        }
      }
    };

    const fail = (err) => {
      const readable =
        err?.code === 1 ? "Permission denied" :
        err?.code === 2 ? "Position unavailable" :
        err?.code === 3 ? "Timeout" :
        err?.message || "Unknown geolocation error";

      setState({ status: "denied", position: null, error: new Error(readable) });
    };

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      ...(options || {}),
    };

    setState((s) => ({ ...s, status: "requesting" }));

    if (watch) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        success,
        fail,
        geoOptions
      );
    } else {
      navigator.geolocation.getCurrentPosition(success, fail, geoOptions);
    }

    return () => {
      if (watch && watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled, uid, watch, saveUserLocation, saveAnalytics, JSON.stringify(options ?? {})]);

  const refresh = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setState({
          status: "granted",
          position: {
            lat: Number(p.coords.latitude),
            lng: Number(p.coords.longitude),
            accuracy: p.coords.accuracy,
            timestamp: p.timestamp || Date.now(),
            source: "browser",
          },
          error: null,
        }),
      (err) =>
        setState({
          status: "denied",
          position: null,
          error: err,
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return { ...state, refresh };
}

