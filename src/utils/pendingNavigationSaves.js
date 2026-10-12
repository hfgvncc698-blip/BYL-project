const saves = new Set();
let flushing;
export function registerNavigationSave(save) {
  saves.add(save);
  return () => saves.delete(save);
}
export function flushNavigationSaves() {
  if (flushing) return flushing;
  flushing = (async () => {
    // Finish each editor before navigating. A failure must keep the page open.
    for (const save of [...saves]) await save();
  })().finally(() => { flushing = null; });
  return flushing;
}
