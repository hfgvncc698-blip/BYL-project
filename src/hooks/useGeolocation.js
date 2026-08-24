// src/hooks/useGeolocation.js
import { useState, useEffect, useRef } from "react";
import { resolveCityCountry } from "../utils/geocoding";

export const GEO_PERMISSION_DECISION_KEY = "BYL_GEO_PERMISSION_DECISION_V1";

const readStoredGeoDecision = () => {
  try {
    const value = localStorage.getItem(GEO_PERMISSION_DECISION_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
};

const writeStoredGeoDecision = (decision) => {
  if (decision !== "granted" && decision !== "denied") return;
  try {
    localStorage.setItem(GEO_PERMISSION_DECISION_KEY, decision);
  } catch {
    // Le navigateur reste l'autorité si le stockage local est indisponible.
  }
};

/**
 * useGeolocation({
 *   uid: string|null,
 *   enabled: boolean,
 *   watch: boolean,
 *   options?: GeolocationPositionOptions,
 *   saveUserLocation: boolean, // compat: l'écriture se fait désormais côté API analytics
 *   saveAnalytics: boolean      // met en cache la geo pour l'appel API analytics
 * })
 */
export default function useGeolocation({
  uid = null,
  enabled = true,
  watch = false,
  options,
  saveUserLocation = false,
  saveAnalytics = false,
  reuseCachedPosition = true,
} = {}) {
  const [state, setState] = useState({
    status: "idle", // idle | requesting | granted | denied | unsupported
    position: null, // {lat,lng,accuracy,timestamp,source}
    error: null,
  });

  const watchIdRef = useRef(null);
  const autoRequestAttemptedRef = useRef(false);
  const [browserPermission, setBrowserPermission] = useState(() =>
    typeof navigator !== "undefined" && navigator.permissions?.query ? "checking" : "unsupported"
  );

  const isUsablePosition = (lat, lng) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  const readCachedGeo = () => {
    try {
      const lat = Number(localStorage.getItem("BYL_LAT"));
      const lng = Number(localStorage.getItem("BYL_LNG"));
      if (!isUsablePosition(lat, lng)) return null;
      return {
        country: localStorage.getItem("BYL_COUNTRY") || null,
        city: localStorage.getItem("BYL_CITY") || null,
        lat,
        lng,
        timestamp: Number(localStorage.getItem("BYL_GEO_UPDATED_AT")) || Date.now(),
        source: "cache",
      };
    } catch {
      return null;
    }
  };

  const clearCachedGeo = () => {
    try {
      ["BYL_COUNTRY", "BYL_CITY", "BYL_LAT", "BYL_LNG", "BYL_GEO_UPDATED_AT"].forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch {
      // ignore
    }
  };

  // Helper: écrit localStorage + déclenche event pour RouteAnalyticsListener
  const writeGeoToStorageAndNotify = ({ country, city, lat, lng }) => {
    let changed = false;
    try {
      const prevC = localStorage.getItem("BYL_COUNTRY");
      const prevCity = localStorage.getItem("BYL_CITY");
      const prevLat = localStorage.getItem("BYL_LAT");
      const prevLng = localStorage.getItem("BYL_LNG");

      if (country && prevC !== country) {
        localStorage.setItem("BYL_COUNTRY", country);
        changed = true;
      }
      if (city && prevCity !== city) {
        localStorage.setItem("BYL_CITY", city);
        changed = true;
      }
      if (Number.isFinite(Number(lat)) && prevLat !== String(lat)) {
        localStorage.setItem("BYL_LAT", String(lat));
        changed = true;
      }
      if (Number.isFinite(Number(lng)) && prevLng !== String(lng)) {
        localStorage.setItem("BYL_LNG", String(lng));
        changed = true;
      }
      localStorage.setItem("BYL_GEO_UPDATED_AT", String(Date.now()));
    } catch {
      // ignore
    }

    // ✅ notify même si identique: utile si listener n'avait pas encore monté
    try {
      window.dispatchEvent(new Event("BYL_GEO_READY"));
    } catch {
      // ignore
    }

    return changed;
  };

  useEffect(() => {
    if (!enabled) return undefined;
    if (!navigator.permissions?.query) {
      setBrowserPermission("unsupported");
      return undefined;
    }
    let permissionStatus = null;
    let cancelled = false;

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        setBrowserPermission(status.state || "prompt");
        status.onchange = () => setBrowserPermission(status.state || "prompt");
      })
      .catch(() => setBrowserPermission("unsupported"));

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [enabled]);

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

    if (browserPermission === "checking") return;

    let storedDecision = readStoredGeoDecision();
    if (browserPermission === "granted" && storedDecision === "denied") {
      storedDecision = "granted";
      writeStoredGeoDecision("granted");
    }
    if (storedDecision === "denied" || browserPermission === "denied") {
      if (browserPermission === "denied") writeStoredGeoDecision("denied");
      clearCachedGeo();
      setState({
        status: "denied",
        position: null,
        error: new Error("Permission denied"),
      });
      return;
    }

    const cached = reuseCachedPosition ? readCachedGeo() : null;
    if (cached && !storedDecision) {
      // Migration des utilisateurs ayant déjà accepté avant l'ajout du choix
      // persistant. La coordonnée historique n'est toutefois plus considérée
      // comme leur position actuelle.
      storedDecision = "granted";
      writeStoredGeoDecision("granted");
    }

    // Une autorisation "une seule fois" peut redevenir `prompt` sur iPhone.
    // Dans ce cas on efface l'ancien lieu et on ne sollicite pas à nouveau
    // l'utilisateur automatiquement.
    if (storedDecision === "granted" && browserPermission !== "granted") {
      clearCachedGeo();
      setState({ status: "idle", position: null, error: null });
      return;
    }

    if (autoRequestAttemptedRef.current) return;
    autoRequestAttemptedRef.current = true;
    // Ne jamais envoyer l'ancien lieu pendant que la nouvelle position est en
    // cours d'acquisition. L'analytics attendra BYL_GEO_READY ou utilisera son
    // fallback approximatif après son délai normal.
    clearCachedGeo();

    const success = async (pos) => {
      const base = {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp || Date.now(),
        source: "browser",
      };

      if (!isUsablePosition(base.lat, base.lng)) {
        setState({
          status: "denied",
          position: null,
          error: new Error("Position géographique invalide"),
        });
        return;
      }

      writeStoredGeoDecision("granted");
      setState({ status: "granted", position: base, error: null });

      // L'écriture Firestore se fait côté backend via /api/analytics/pageview.
      if (saveAnalytics) {
        try {
          let cityCountry = await resolveCityCountry(base.lat, base.lng);
          if (!cityCountry) cityCountry = { city: null, country: null };

          // ✅ localStorage pour RouteAnalyticsListener + event
          writeGeoToStorageAndNotify({ ...cityCountry, lat: base.lat, lng: base.lng });
        } catch (err) {
          console.error("Failed to save analytics geo:", err);
          writeGeoToStorageAndNotify({ country: null, city: null, lat: base.lat, lng: base.lng });
        }
      }
    };

    const fail = (err) => {
      const readable =
        err?.code === 1
          ? "Permission denied"
          : err?.code === 2
          ? "Position unavailable"
          : err?.code === 3
          ? "Timeout"
          : err?.message || "Unknown geolocation error";

      if (err?.code === 1) writeStoredGeoDecision("denied");
      setState({ status: err?.code === 1 ? "denied" : "idle", position: null, error: new Error(readable) });
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
  }, [enabled, uid, watch, saveUserLocation, saveAnalytics, reuseCachedPosition, browserPermission, JSON.stringify(options ?? {})]);

  const refresh = async () => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const base = {
          lat: Number(p.coords.latitude),
          lng: Number(p.coords.longitude),
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp || Date.now(),
          source: "browser",
        };

        if (!isUsablePosition(base.lat, base.lng)) {
          setState({
            status: "denied",
            position: null,
            error: new Error("Position géographique invalide"),
          });
          return;
        }

        writeStoredGeoDecision("granted");
        setState({ status: "granted", position: base, error: null });

        // Si on veut aussi mettre à jour la geo analytics lors d’un refresh
        if (saveAnalytics) {
          try {
            let cityCountry = await resolveCityCountry(base.lat, base.lng);
            if (!cityCountry) cityCountry = { city: null, country: null };

            writeGeoToStorageAndNotify({ ...cityCountry, lat: base.lat, lng: base.lng });
          } catch (err) {
            console.error("Failed to refresh analytics geo:", err);
            writeGeoToStorageAndNotify({ country: null, city: null, lat: base.lat, lng: base.lng });
          }
        }
      },
      (err) => {
        if (err?.code === 1) writeStoredGeoDecision("denied");
        setState({ status: "denied", position: null, error: err });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return { ...state, refresh };
}
