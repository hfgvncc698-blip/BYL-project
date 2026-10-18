import { useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { apiFetch } from '../utils/api';

// Report preferences, never coordinates. Permissions stay local to the device.
export default function useLocationSettingsReport(uid, preference, analyticsEnabled) {
  useEffect(() => {
    if (!uid || auth.currentUser?.uid !== uid) return;
    let cancelled = false;
    let permission;
    let lastSent = '';
    let pending;
    const report = () => {
      if (cancelled || auth.currentUser?.uid !== uid) return;
      const body = JSON.stringify({ preference: preference ?? null, analyticsEnabled,
        browserPermission: !navigator.geolocation ? 'unsupported' : permission?.state || 'unknown' });
      if (body === lastSent) return;
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (cancelled) return;
        apiFetch('/client-profile/location-settings', { method: 'PUT', body })
          .then(() => { lastSent = body; }).catch(() => {});
      }, 300);
    };
    if (navigator.permissions?.query && navigator.geolocation) {
      navigator.permissions.query({ name: 'geolocation' }).then(value => {
        if (cancelled) return;
        permission = value;
        permission.addEventListener('change', report);
        report();
      }).catch(report);
    } else report();
    window.addEventListener('focus', report);
    return () => { cancelled = true; clearTimeout(pending); permission?.removeEventListener('change', report); window.removeEventListener('focus', report); };
  }, [uid, preference, analyticsEnabled]);
}
