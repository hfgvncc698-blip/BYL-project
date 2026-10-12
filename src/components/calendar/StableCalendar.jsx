import React from "react";
import { Calendar } from "react-big-calendar";

// The DnD addon rebuilds nested wrapper component types on every drag-state
// update (including mousedown). Keep those types stable for one input component
// configuration so the pressed event is not unmounted before mouseup/click.
export default function StableCalendar({ componentIdentity, components, ...props }) {
  const cache = React.useRef(null);
  if (!cache.current || cache.current.identity !== componentIdentity) {
    cache.current = { identity: componentIdentity, components };
  }
  return <Calendar {...props} components={cache.current.components} />;
}
