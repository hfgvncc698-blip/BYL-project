import { useEffect, useRef } from 'react';
import { api } from './clubMessagingApi';
import { stampOrder } from './useClubThread';

// Acknowledge only an incoming bubble that was visible in the open pane.
export function useVisibleReceipt({
  pane,
  rows,
  side,
  account,
  params,
  enabled,
  ownReadVersion,
  ownReadId,
  professional = false
}) {
  const acknowledged = useRef(null);
  useEffect(() => {
    acknowledged.current = null;
  }, [params, account]);
  useEffect(() => {
    if (!enabled || !account || !pane.current || !rows.length) return;
    const controller = new AbortController();
    let pending = false,
      desired = null,
      timer;
    const visible = new Map();
    const compare = (message, stamp, id) => {
      const order = stampOrder(message.watermark, stamp);
      if (order || professional || !id || message.id === id) return order;
      return message.id > id ? 1 : -1;
    };
    const flush = async () => {
      if (!desired || pending || document.hidden || controller.signal.aborted) return;
      const msg = desired;
      if (compare(msg, acknowledged.current?.watermark, acknowledged.current?.id) <= 0 || compare(msg, ownReadVersion, ownReadId) <= 0) return;
      pending = true;
      try {
        await api('read', {
          ...JSON.parse(params),
          messageId: msg.id,
          watermark: msg.watermark
        }, controller.signal, account, professional);
        if (!controller.signal.aborted) acknowledged.current = msg;
      } catch (error) {
        if (!controller.signal.aborted && ![400,401,403,409].includes(error.status)) timer = setTimeout(flush, 2000);
        return;
      } finally {
        pending = false;
      }
      if (desired !== msg) flush();
    };
    const select = () => {
      if (document.hidden) return;
      for (const msg of visible.values()) if (!desired || compare(msg, desired.watermark, desired.id) > 0) desired = msg;
      flush();
    };
    const byId = new Map(rows.filter(m => m.watermark && (professional ? m.senderUid !== account.uid : m.side !== side)).map(m => [m.id, m]));
    const observer = new IntersectionObserver(items => {
      for (const item of items) {
        const id = item.target.dataset.messageId;
        if (item.isIntersecting && item.intersectionRatio > 0) visible.set(id, byId.get(id));
        else visible.delete(id);
      }
      select();
    }, {
      root: pane.current,
      threshold: 0
    });
    for (const element of pane.current.querySelectorAll('[data-message-id]')) if (byId.has(element.dataset.messageId)) observer.observe(element);
    document.addEventListener('visibilitychange', select);
    return () => {
      observer.disconnect();
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', select);
    };
  }, [pane, rows, side, account, params, enabled, ownReadVersion, ownReadId, professional]);
}
