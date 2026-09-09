import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGeoMapAutoFit, getGeoVisitorLoadBatch, isValidMapPoint } from "../src/utils/geoMapViewport.js";
import { getVisitLocationDisplay } from "../src/utils/geoVisitDisplay.js";

const points = [{ geoId: "city-a", lat: 43.5, lon: 7 }, { geoId: "city-b", lat: 21.5, lon: 39 }];
const calls = [];
let zoom = 2;
const fit = createGeoMapAutoFit((positions, options) => {
  calls.push({ positions, options });
  zoom = positions.length > 1 ? 4 : options.maxZoom;
});
assert.equal(fit([], "today"), false, "wait for first coordinates");
assert.equal(fit(points, "today"), true, "initial fit");
assert.equal(calls.length, 1);
zoom = 13; // A cluster click or a city selected in the table.
assert.equal(fit(points.map((point) => ({ ...point })), "today"), false, "15s polling preserves view");
assert.equal(zoom, 13, "regression: refresh must not zoom back to 4");
assert.equal(fit([{ ...points[0], value: 12 }], "today"), false, "popup/filter data loading preserves view");
assert.equal(fit([...points, { lat: 48, lon: 2 }], "today"), false, "new visit preserves manual zoom");
assert.equal(fit(points, "today:recenter-1"), true, "explicit recenter");
assert.equal(zoom, 4);
assert.equal(fit([points[0]], "search:city-a"), true, "changed filter fits selected city");
assert.equal(zoom, 13, "one point has a bounded initial zoom");
assert.equal(fit([], "search:missing"), false);
assert.equal(fit([points[0]], "search:city-a"), true, "return from an empty filter fits again");
assert.equal(fit([points[0]], "search:city-a"), false, "React effect replay cannot refit");
assert.equal(fit([points[0]], "7d"), true, "changed period can refit");
const callsBeforePeopleFilter = calls.length;
assert.equal(fit(points, "person:coach", true), false, "do not fit unfiltered cities while people load");
assert.equal(calls.length, callsBeforePeopleFilter);
assert.equal(fit([points[0]], "person:coach", false), true, "fit final asynchronous filter results");
assert.equal(zoom, 13);
assert.equal(fit([points[0]], "person:coach", false), false, "subsequent popup updates preserve filtered view");
assert.deepEqual(calls[0].positions, [[43.5, 7], [21.5, 39]]);
assert.deepEqual(calls[0].options, { padding: [32, 32], maxZoom: 13, animate: false });

for (const point of [{}, { lat: null, lon: 7 }, { lat: NaN, lon: 7 }, { lat: 91, lon: 0 },
  { lat: 43, lon: Infinity }, { lat: 43, lon: 181 }, { lat: 0, lon: 0 }]) {
  assert.equal(isValidMapPoint(point), false, JSON.stringify(point));
}
assert.equal(isValidMapPoint({ lat: 0, lon: 7 }), true);
assert.equal(isValidMapPoint({ lat: 43, lon: 0 }), true);

const manyCities = Array.from({ length: 65 }, (_, index) => ({ geoId: `city-${index}` }));
const visitorCache = {};
let loadedCities = 0;
while (loadedCities < manyCities.length) {
  const batch = getGeoVisitorLoadBatch(manyCities, visitorCache, "today");
  assert.ok(batch.length > 0 && batch.length <= 6);
  batch.forEach((point) => { visitorCache[`today:${point.geoId}`] = { loading: true }; });
  if (batch.length === 6) assert.equal(getGeoVisitorLoadBatch(manyCities, visitorCache, "today").length, 0);
  batch.forEach((point) => { visitorCache[`today:${point.geoId}`] = { loading: false, visitors: [] }; });
  loadedCities += batch.length;
}
assert.equal(loadedCities, 65, "people filter must finish beyond the first 50 cities");
assert.equal(getGeoVisitorLoadBatch(manyCities, visitorCache, "today").length, 0);
assert.equal(getGeoVisitorLoadBatch(manyCities, visitorCache, "7d").length, 6, "cache is period-scoped");
const inFlightCache = Object.fromEntries(manyCities.slice(0, 6).map((point) => [`today:${point.geoId}`, { loading: true }]));
inFlightCache["today:city-0"] = { loading: false, error: "network-error", visitors: [] };
assert.deepEqual(getGeoVisitorLoadBatch(manyCities, inFlightCache, "today"), [manyCities[6]],
  "one completed or failed request frees one slot without retrying a failure indefinitely");
assert.equal(getGeoVisitorLoadBatch(manyCities, inFlightCache, "7d").length, 6,
  "in-flight results from another period cannot hide pending cities");

assert.deepEqual(getVisitLocationDisplay(), { label: "Position non disponible", detail: "" });
assert.deepEqual(getVisitLocationDisplay({ city: "unknown", country: "un", lat: null, lng: null, accuracy: null }),
  { label: "Position non disponible", detail: "" });
assert.deepEqual(getVisitLocationDisplay({ city: "Cannes", country: "fr", lat: 43.5, lng: 7, accuracy: 17.2 }),
  { label: "Cannes, FR", detail: "Précision ≈ 17 m" });
assert.deepEqual(getVisitLocationDisplay({ city: "unknown", country: "UN", lat: 43.5, lng: 7, accuracy: null }),
  { label: "43.5000, 7.0000", detail: "Coordonnées reçues, ville non déterminée." });
assert.equal(getVisitLocationDisplay({ city: "Cannes", country: "FR", lat: 43.5, lng: 7, accuracy: null }).detail, "",
  "missing accuracy must not be displayed as 0m");
assert.equal(getVisitLocationDisplay({ country: "FR" }).detail, "Localisation approximative : pays uniquement.");
assert.equal(getVisitLocationDisplay({ lat: 91, lng: 7 }).label, "Position non disponible");
assert.equal(getVisitLocationDisplay({ lat: 0, lng: 0 }).label, "Position non disponible");

const source = readFileSync(new URL("../src/pages/AdminGeo.jsx", import.meta.url), "utf8");
assert.match(source, /<FitToMarkers points=\{mapPoints\} requestKey=\{mapFitRequestKey\}/);
assert.doesNotMatch(source, /window\.L/);
assert.match(source, /const map = useMapEvents\(handlers\)/, "zoom listener remains subscribed during synchronous fits");
assert.match(source, /zoomend: \(event\) => onZoomChange\(event.target.getZoom\(\)\)/);
assert.match(source, /setMapRecenterRequest\(\(value\) => value \+ 1\)/);
assert.match(source, /getVisitLocationDisplay\(visit\)/);
assert.match(source, /visites enregistrées/);
assert.equal((source.match(/bubblingMouseEvents=\{false\}/g) || []).length, 2);
console.log("Admin Geo: viewport polling/zoom, explicit recenter, filters, empty/invalid points, location labels and accuracy regressions OK.");
