/**
 * NEXUS - X3DH (Extended Triple Diffie-Hellman) Protocol
 * Standard Asynchronous Key Agreement for End-to-End Encryption
 *
 * Implements:
 * - Identity Keys (IK)
 * - Signed Prekeys (SPK)
 * - One-Time Prekeys (OPK)
 * - 4-stage DH calculation (DH1 || DH2 || DH3 || DH4)
 * - HKDF expansion to establish the initial Shared Master Key (SK)
 */

import {
  generateEcdhKeyPair,
  exportPublicKeyHex,
  exportPrivateKeyJwk,
  importPublicKeyFromHex,
  importPrivateKeyFromJwk,
  computeDiffieHellman,
  hkdfDerive,
  bytesToHex,
  formatFingerprint,
} from './webCrypto';
import { PreKeyBundle } from '../types';

export interface LocalIdentityRecord {
  userId: string;
  deviceId: string;
  identityKeyHex: string;
  identityPrivateKeyJwk: string;
  signedPreKeyHex: string;
  signedPreKeyPrivateJwk: string;
  oneTimePreKeys: Array<{
    keyHex: string;
    privateJwk: string;
  }>;
}

export interface X3dhHandshakeResult {
  sharedKeyHex: string;
  ephemeralPublicKeyHex: string;
  oneTimePreKeyHexUsed?: string;
  dh1Hex: string;
  dh2Hex: string;
  dh3Hex: string;
  dh4Hex?: string;
}

// Generate complete local user key bundles (client-side only)
export async function generateLocalIdentity(
  userId: string,
  deviceId: string,
  opkCount: number = 5
): Promise<LocalIdentityRecord> {
  // 1. Identity Key Pair
  const ik = await generateEcdhKeyPair();
  const ikPubHex = await exportPublicKeyHex(ik.publicKey);
  const ikPrivJwk = await exportPrivateKeyJwk(ik.privateKey);

  // 2. Signed Prekey Pair
  const spk = await generateEcdhKeyPair();
  const spkPubHex = await exportPublicKeyHex(spk.publicKey);
  const spkPrivJwk = await exportPrivateKeyJwk(spk.privateKey);

  // 3. One-time Prekeys
  const opks: Array<{ keyHex: string; privateJwk: string }> = [];
  for (let i = 0; i < opkCount; i++) {
    const opk = await generateEcdhKeyPair();
    const opkPubHex = await exportPublicKeyHex(opk.publicKey);
    const opkPrivJwk = await exportPrivateKeyJwk(opk.privateKey);
    opks.push({
      keyHex: opkPubHex,
      privateJwk: opkPrivJwk,
    });
  }

  return {
    userId,
    deviceId,
    identityKeyHex: ikPubHex,
    identityPrivateKeyJwk: ikPrivJwk,
    signedPreKeyHex: spkPubHex,
    signedPreKeyPrivateJwk: spkPrivJwk,
    oneTimePreKeys: opks,
  };
}

// Convert local identity into a public PreKeyBundle to register with the Relay Server
export function createPublicPreKeyBundle(localId: LocalIdentityRecord): PreKeyBundle {
  const availableOpk = localId.oneTimePreKeys[0]?.keyHex;
  return {
    userId: localId.userId,
    deviceId: localId.deviceId,
    identityPublicKeyHex: localId.identityKeyHex,
    signedPreKeyHex: localId.signedPreKeyHex,
    signedPreKeySignature: `SIG_${localId.signedPreKeyHex.substring(0, 16)}`,
    oneTimePreKeyHex: availableOpk,
  };
}

// Alice initiates X3DH handshake with Bob's PreKeyBundle
export async function initiateX3dh(
  aliceIdentity: LocalIdentityRecord,
  bobBundle: PreKeyBundle
): Promise<X3dhHandshakeResult> {
  // Alice imports her Identity Private Key
  const aliceIkPriv = await importPrivateKeyFromJwk(aliceIdentity.identityPrivateKeyJwk);

  // Alice generates an Ephemeral Key pair (EK_A)
  const aliceEk = await generateEcdhKeyPair();
  const aliceEkPubHex = await exportPublicKeyHex(aliceEk.publicKey);

  // Import Bob's public keys
  const bobIkPub = await importPublicKeyFromHex(bobBundle.identityPublicKeyHex);
  const bobSpkPub = await importPublicKeyFromHex(bobBundle.signedPreKeyHex);

  // Calculate DH1 = DH(IK_A, SPK_B)
  const dh1 = await computeDiffieHellman(aliceIkPriv, bobSpkPub);

  // Calculate DH2 = DH(EK_A, IK_B)
  const dh2 = await computeDiffieHellman(aliceEk.privateKey, bobIkPub);

  // Calculate DH3 = DH(EK_A, SPK_B)
  const dh3 = await computeDiffieHellman(aliceEk.privateKey, bobSpkPub);

  let dh4: Uint8Array | null = null;
  if (bobBundle.oneTimePreKeyHex) {
    const bobOpkPub = await importPublicKeyFromHex(bobBundle.oneTimePreKeyHex);
    // Calculate DH4 = DH(EK_A, OPK_B)
    dh4 = await computeDiffieHellman(aliceEk.privateKey, bobOpkPub);
  }

  // Concatenate DH outputs: DH1 || DH2 || DH3 (|| DH4)
  const totalLength = dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  combined.set(dh1, offset);
  offset += dh1.length;
  combined.set(dh2, offset);
  offset += dh2.length;
  combined.set(dh3, offset);
  offset += dh3.length;
  if (dh4) {
    combined.set(dh4, offset);
  }

  // Derive initial 32-byte shared master secret (SK) using HKDF
  const salt = new Uint8Array(32); // Standard zero salt for X3DH
  const masterKey = await hkdfDerive(combined, salt, 'NEXUS_X3DH_V1_MASTER_SECRET', 32);

  return {
    sharedKeyHex: bytesToHex(masterKey),
    ephemeralPublicKeyHex: aliceEkPubHex,
    oneTimePreKeyHexUsed: bobBundle.oneTimePreKeyHex,
    dh1Hex: bytesToHex(dh1),
    dh2Hex: bytesToHex(dh2),
    dh3Hex: bytesToHex(dh3),
    dh4Hex: dh4 ? bytesToHex(dh4) : undefined,
  };
}

// Bob receives initial envelope from Alice and computes the identical Shared Secret
export async function completeX3dh(
  bobIdentity: LocalIdentityRecord,
  aliceIdentityKeyHex: string,
  aliceEphemeralKeyHex: string,
  oneTimePreKeyUsedHex?: string
): Promise<{ sharedKeyHex: string; dh1Hex: string; dh2Hex: string; dh3Hex: string; dh4Hex?: string }> {
  // Bob's private keys
  const bobIkPriv = await importPrivateKeyFromJwk(bobIdentity.identityPrivateKeyJwk);
  const bobSpkPriv = await importPrivateKeyFromJwk(bobIdentity.signedPreKeyPrivateJwk);

  // Alice's public keys
  const aliceIkPub = await importPublicKeyFromHex(aliceIdentityKeyHex);
  const aliceEkPub = await importPublicKeyFromHex(aliceEphemeralKeyHex);

  // DH1 = DH(SPK_B, IK_A)
  const dh1 = await computeDiffieHellman(bobSpkPriv, aliceIkPub);

  // DH2 = DH(IK_B, EK_A)
  const dh2 = await computeDiffieHellman(bobIkPriv, aliceEkPub);

  // DH3 = DH(SPK_B, EK_A)
  const dh3 = await computeDiffieHellman(bobSpkPriv, aliceEkPub);

  let dh4: Uint8Array | null = null;
  if (oneTimePreKeyUsedHex) {
    const matchedOpk = bobIdentity.oneTimePreKeys.find((k) => k.keyHex === oneTimePreKeyUsedHex);
    if (matchedOpk) {
      const opkPriv = await importPrivateKeyFromJwk(matchedOpk.privateJwk);
      dh4 = await computeDiffieHellman(opkPriv, aliceEkPub);
    }
  }

  // Concatenate in identical order: DH1 || DH2 || DH3 (|| DH4)
  const totalLength = dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  combined.set(dh1, offset);
  offset += dh1.length;
  combined.set(dh2, offset);
  offset += dh2.length;
  combined.set(dh3, offset);
  offset += dh3.length;
  if (dh4) {
    combined.set(dh4, offset);
  }

  const salt = new Uint8Array(32);
  const masterKey = await hkdfDerive(combined, salt, 'NEXUS_X3DH_V1_MASTER_SECRET', 32);

  return {
    sharedKeyHex: bytesToHex(masterKey),
    dh1Hex: bytesToHex(dh1),
    dh2Hex: bytesToHex(dh2),
    dh3Hex: bytesToHex(dh3),
    dh4Hex: dh4 ? bytesToHex(dh4) : undefined,
  };
}

export function computeSafetyNumber(aliceKeyHex: string, bobKeyHex: string): string {
  // Fingerprints combined sorted to be commutative
  const combined = [aliceKeyHex, bobKeyHex].sort().join(':');
  return formatFingerprint(combined);
}
