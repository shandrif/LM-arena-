/* Record codec shared by the storage back-ends: a whole record (including a stored PDF) <-> one compact string
   ("z" + base64 of gzip(JSON), or "j" + base64 of the JSON when the browser cannot compress). */
(function () {
  const LM = window.LM;
  const toB64 = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  const fromB64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  const hasGz = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function encode(rec) { const raw = new TextEncoder().encode(JSON.stringify(LM.packRecord(rec))); return hasGz ? 'z' + toB64(await pipe(raw, new CompressionStream('gzip'))) : 'j' + toB64(raw); }
  async function decode(str) { let u = fromB64(str.slice(1)); if (str[0] === 'z') u = await pipe(u, new DecompressionStream('gzip')); return LM.unpackRecord(JSON.parse(new TextDecoder().decode(u))); }
  LM.codec = { encode, decode };
})();
