/**
 * NEXUS - Content-Addressed Storage & Merkle Hash-Chain
 * Provides blockchain-grade tamper evidence WITHOUT consensus overhead.
 *
 * Each message chunk is hashed to its Content ID (CID).
 * Messages chain together via previousCid hashes.
 * Any bit flipped on the server breaks the Merkle integrity check immediately.
 */

import { sha256, bytesToHex, generateContentId } from './webCrypto';

export interface MerkleVerificationResult {
  isValid: boolean;
  computedRoot: string;
  expectedRoot: string;
  tamperedIndex?: number;
  error?: string;
}

// Compute CID for an encrypted envelope chunk
export async function computeEnvelopeCid(
  ciphertextHex: string,
  ivHex: string,
  authTagHex: string,
  previousCid: string
): Promise<string> {
  const combined = `${previousCid}:${ciphertextHex}:${ivHex}:${authTagHex}`;
  return await generateContentId(combined);
}

// Calculate Merkle Root over a list of message CIDs
export async function computeMerkleRoot(cids: string[]): Promise<string> {
  if (cids.length === 0) {
    return '0'.repeat(64);
  }

  let currentLevel = [...cids];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const combined = `${currentLevel[i]}:${currentLevel[i + 1]}`;
        const hash = await sha256(combined);
        nextLevel.push(bytesToHex(hash));
      } else {
        // Odd number of leaves: hash with itself
        const combined = `${currentLevel[i]}:${currentLevel[i]}`;
        const hash = await sha256(combined);
        nextLevel.push(bytesToHex(hash));
      }
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

// Verify the integrity of a conversation's hash chain
export async function verifyConversationChain(
  envelopes: Array<{
    cid: string;
    previousCid: string;
    ciphertextHex: string;
    ivHex: string;
    authTagHex: string;
  }>
): Promise<MerkleVerificationResult> {
  let expectedPrev = 'GENESIS_CID_00000000000000000000';

  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i];

    // 1. Verify previousCid pointer
    if (env.previousCid !== expectedPrev) {
      return {
        isValid: false,
        computedRoot: '',
        expectedRoot: '',
        tamperedIndex: i,
        error: `Broken chain pointer at index ${i}. Expected ${expectedPrev.substring(0, 12)}..., got ${env.previousCid.substring(0, 12)}...`,
      };
    }

    // 2. Recompute CID from raw encrypted content
    const recomputedCid = await computeEnvelopeCid(
      env.ciphertextHex,
      env.ivHex,
      env.authTagHex,
      env.previousCid
    );

    if (recomputedCid !== env.cid) {
      return {
        isValid: false,
        computedRoot: '',
        expectedRoot: '',
        tamperedIndex: i,
        error: `CID mismatch at index ${i}. Content was tampered on the relay server! Expected ${env.cid}, computed ${recomputedCid}`,
      };
    }

    expectedPrev = env.cid;
  }

  const allCids = envelopes.map((e) => e.cid);
  const root = await computeMerkleRoot(allCids);

  return {
    isValid: true,
    computedRoot: root,
    expectedRoot: root,
  };
}
