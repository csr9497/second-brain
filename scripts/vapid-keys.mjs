// Genera las claves VAPID en el formato de jsr:@negrel/webpush:
//   VAPID_KEYS            → secret de la Edge Function (JWK de la pareja)
//   VITE_VAPID_PUBLIC_KEY → clave pública cruda en base64url para pushManager.subscribe
// Uso: node scripts/vapid-keys.mjs  (una vez; la misma pareja en dev y prod o una por proyecto)
const { subtle } = globalThis.crypto;
const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { publicKey: await subtle.exportKey('jwk', keys.publicKey), privateKey: await subtle.exportKey('jwk', keys.privateKey) };
const raw = Buffer.from(await subtle.exportKey('raw', keys.publicKey)).toString('base64url');
console.log(`VAPID_KEYS='${JSON.stringify(jwk)}'`);
console.log(`VITE_VAPID_PUBLIC_KEY=${raw}`);
