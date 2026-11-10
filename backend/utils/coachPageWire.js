// JSON maps can themselves contain the discriminator; escape those maps so
// custom fields never become a Timestamp, reference or byte string by accident.
function encode(value) {
  if (typeof value==='number' && (!Number.isFinite(value) || Object.is(value,-0)))return {__bylWire:['number',Object.is(value,-0)?'-0':String(value)]};
  if (value===null || typeof value!=='object') return value;
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value.toMillis==='function' && Number.isInteger(value.nanoseconds))
    return {__bylWire:['time',value.seconds,value.nanoseconds]};
  if (typeof value.latitude==='number' && typeof value.longitude==='number' && typeof value.isEqual==='function')
    return {__bylWire:['point',value.latitude,value.longitude]};
  if(typeof value.toArray==='function' && typeof value.isEqual==='function')return {__bylWire:['vector',value.toArray()]};
  if (Buffer.isBuffer(value)) return {__bylWire:['bytes',value.toString('base64')]};
  if (value.firestore && typeof value.path==='string') return {__bylWire:['ref',value.path]};
  const entries=Object.entries(value).map(([key,v])=>[key,encode(v)]);
  return Object.hasOwn(value,'__bylWire') ? {__bylWire:['map',entries]} : Object.fromEntries(entries);
}
module.exports={encode};
