import { useSyncExternalStore } from "react";

const KEY = "BYL_LOCATION_ENABLED_V1";
const EVENT = "BYL_LOCATION_PREFERENCE_CHANGED";
const read = () => {
  try {
    const value = localStorage.getItem(KEY);
    return value === "true" ? true : value === "false" ? false : null;
  } catch { return null; }
};
const subscribe = (listener) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};
export default function useLocationPreference() {
  const preference = useSyncExternalStore(subscribe, read, () => null);
  const setPreference = (enabled) => {
    // Let the caller report storage failures rather than claim the choice was saved.
    localStorage.setItem(KEY, String(enabled));
    if (!enabled) {
      ["BYL_COUNTRY", "BYL_CITY", "BYL_LAT", "BYL_LNG", "BYL_GEO_ACCURACY", "BYL_GEO_SOURCE", "BYL_GEO_UPDATED_AT", "BYL_GEO_PAGE_LOAD_ID"].forEach((key) => localStorage.removeItem(key));
    } else {
      localStorage.removeItem("BYL_GEO_PERMISSION_DECISION_V1");
    }
    window.dispatchEvent(new Event(EVENT));
    window.dispatchEvent(new Event("BYL_GEO_READY"));
  };
  return [preference, setPreference];
}
