import {privateSessionIdentity, privateSessionVersion, onPrivateSessionChange} from './privateSession.js';
// Only device preferences without business contents may remain persistent.
const publicKey = key => /^(?:BYL_VIEW_AS|byl_consent_v1|BYL_COOKIE_PREFS|BYL_LOCATION_ENABLED_V1|BYL_GEO_PERMISSION_DECISION_V1|byl_color_mode_manual_(?:ts|value|version)|i18nextLng|chakra-ui-color-mode|unit\.(?:height|weight)|byl_(?:weight|speed|distance)_unit|BYL_PLAYER_(?:SOUND|HAPTICS|AUTO_FLOW)|byl_ciqual_2025_loaded_v1)$/.test(key);
const accessible = () => !!privateSessionIdentity() || privateSessionVersion() === 0;
function storage(kind) {
  const values = new Map();
  onPrivateSessionChange(() => values.clear());
  const native = () => { try { return globalThis.window?.[kind]; } catch { return null; } };
  return {
    get length() { return accessible() ? values.size : 0; },
    key(index) { return accessible() ? [...values.keys()][index] ?? null : null; },
    getItem(key) {
      if (publicKey(key)) { try { return native()?.getItem(key) ?? null; } catch { return null; } }
      return accessible() ? values.get(String(key)) ?? null : null;
    },
    setItem(key, value) {
      if (publicKey(key)) { try { native()?.setItem(key, String(value)); } catch {} return; }
      if (accessible()) values.set(String(key), String(value));
    },
    removeItem(key) {
      if (publicKey(key)) { try { native()?.removeItem(key); } catch {} return; }
      // Never deletes inherited private data. Migration needs separate approval.
      values.delete(String(key));
    },
    clear() { values.clear(); },
  };
}
export const localSessionStorage = storage('localStorage');
export const tabSessionStorage = storage('sessionStorage');
