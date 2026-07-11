import * as crypto from "crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // ±1 step (~30s) of clock drift tolerance

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const last = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(last, 2)];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

export const totp = {
  generateSecret(byteLength = 20): string {
    return base32Encode(crypto.randomBytes(byteLength));
  },

  keyUri(accountName: string, issuer: string, secret: string): string {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: "SHA1",
      digits: String(DIGITS),
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  },

  generate(secret: string, at: number = Date.now()): string {
    const counter = Math.floor(at / 1000 / STEP_SECONDS);
    return hotp(base32Decode(secret), counter);
  },

  verify(token: string, secret: string, at: number = Date.now()): boolean {
    if (!/^\d{6}$/.test(token)) return false;
    const counter = Math.floor(at / 1000 / STEP_SECONDS);
    const secretBuf = base32Decode(secret);
    for (let errorWindow = -WINDOW; errorWindow <= WINDOW; errorWindow++) {
      const candidate = hotp(secretBuf, counter + errorWindow);
      if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token)))
        return true;
    }
    return false;
  },
};
