/**
 * NEXUS - Double Ratchet Algorithm Implementation
 * Based on Signal Protocol / Trevor Perrin & Moxie Marlinspike specification.
 *
 * Implements:
 * 1. KDF Chain (Symmetric Ratchet for continuous message key derivation)
 * 2. Diffie-Hellman Ratchet (Asymmetric Ratchet for Post-Compromise Security / Future Secrecy)
 * 3. Forward Secrecy: message keys are immediately deleted after use
 */

import {
  generateEcdhKeyPair,
  exportPublicKeyHex,
  exportPrivateKeyJwk,
  importPublicKeyFromHex,
  importPrivateKeyFromJwk,
  computeDiffieHellman,
  hkdfDerive,
  encryptAesGcm,
  decryptAesGcm,
  hexToBytes,
  bytesToHex,
} from './webCrypto';

export interface ActiveRatchetSession {
  sessionId: string;
  peerId: string;
  peerDeviceId: string;

  // DH Ratchet Keys
  localDhPublicKeyHex: string;
  localDhPrivateKeyJwk: string;
  remoteDhPublicKeyHex: string;
  lastDhSentToRemote: string;

  // Root & Chain Keys (32 bytes each)
  rootKeyHex: string;
  sendingChainKeyHex: string;
  receivingChainKeyHex: string;

  // Message counters
  sendSequenceNumber: number;
  receiveSequenceNumber: number;
  previousCounter: number;

  // Track skipped message keys for out-of-order delivery
  skippedKeys: Record<string, string>; // "remoteDhPub:seq" -> messageKeyHex
}

// Initialize a session for Alice (Sender of the first message)
export async function initAliceSession(
  sessionId: string,
  peerId: string,
  peerDeviceId: string,
  sharedMasterKeyHex: string,
  remoteRatchetPublicKeyHex: string
): Promise<ActiveRatchetSession> {
  const aliceDh = await generateEcdhKeyPair();
  const aliceDhPubHex = await exportPublicKeyHex(aliceDh.publicKey);
  const aliceDhPrivJwk = await exportPrivateKeyJwk(aliceDh.privateKey);

  const remoteDhPub = await importPublicKeyFromHex(remoteRatchetPublicKeyHex);
  const dhSecret = await computeDiffieHellman(aliceDh.privateKey, remoteDhPub);

  // Root Key KDF: derive new Root Key and Sending Chain Key
  const salt = hexToBytes(sharedMasterKeyHex);
  const derived = await hkdfDerive(dhSecret, salt, 'NEXUS_RATCHET_KDF_RK', 64);
  const nextRootKey = derived.slice(0, 32);
  const sendingChainKey = derived.slice(32, 64);

  return {
    sessionId,
    peerId,
    peerDeviceId,
    localDhPublicKeyHex: aliceDhPubHex,
    localDhPrivateKeyJwk: aliceDhPrivJwk,
    remoteDhPublicKeyHex: remoteRatchetPublicKeyHex,
    lastDhSentToRemote: remoteRatchetPublicKeyHex,
    rootKeyHex: bytesToHex(nextRootKey),
    sendingChainKeyHex: bytesToHex(sendingChainKey),
    receivingChainKeyHex: '',
    sendSequenceNumber: 0,
    receiveSequenceNumber: 0,
    previousCounter: 0,
    skippedKeys: {},
  };
}

// Initialize a session for Bob (Recipient of the first message)
export async function initBobSession(
  sessionId: string,
  peerId: string,
  peerDeviceId: string,
  sharedMasterKeyHex: string,
  bobRatchetPublicKeyHex: string,
  bobRatchetPrivateKeyJwk: string
): Promise<ActiveRatchetSession> {
  return {
    sessionId,
    peerId,
    peerDeviceId,
    localDhPublicKeyHex: bobRatchetPublicKeyHex,
    localDhPrivateKeyJwk: bobRatchetPrivateKeyJwk,
    remoteDhPublicKeyHex: '', // Will be populated on first incoming envelope
    lastDhSentToRemote: '',
    rootKeyHex: sharedMasterKeyHex,
    sendingChainKeyHex: '',
    receivingChainKeyHex: '',
    sendSequenceNumber: 0,
    receiveSequenceNumber: 0,
    previousCounter: 0,
    skippedKeys: {},
  };
}

// Symmetric KDF Step: advances chain key and derives single-use message key
async function stepKdfChain(chainKeyHex: string): Promise<{
  nextChainKeyHex: string;
  messageKeyBytes: Uint8Array;
}> {
  const chainKeyBytes = hexToBytes(chainKeyHex);
  const salt = new Uint8Array(32); // zero salt
  const derived = await hkdfDerive(chainKeyBytes, salt, 'NEXUS_SYMMETRIC_KDF_STEP', 64);

  const nextChainKey = derived.slice(0, 32);
  const messageKey = derived.slice(32, 64);

  return {
    nextChainKeyHex: bytesToHex(nextChainKey),
    messageKeyBytes: messageKey,
  };
}

// Encrypt an outgoing message using current sending ratchet
export async function ratchetEncrypt(
  session: ActiveRatchetSession,
  plaintext: string
): Promise<{
  ciphertextHex: string;
  ivHex: string;
  authTagHex: string;
  ephemeralDhPubKeyHex: string;
  sequenceNumber: number;
  previousChainLength: number;
}> {
  // If sending chain is empty or we received a new DH key from remote since our last send:
  if (
    !session.sendingChainKeyHex ||
    (session.remoteDhPublicKeyHex && session.remoteDhPublicKeyHex !== session.lastDhSentToRemote)
  ) {
    // Generate fresh local DH keypair
    const newLocalDh = await generateEcdhKeyPair();
    const newLocalDhPubHex = await exportPublicKeyHex(newLocalDh.publicKey);
    const newLocalDhPrivJwk = await exportPrivateKeyJwk(newLocalDh.privateKey);

    const remoteDhPub = await importPublicKeyFromHex(session.remoteDhPublicKeyHex);
    const dhSecret = await computeDiffieHellman(newLocalDh.privateKey, remoteDhPub);

    const rootSalt = hexToBytes(session.rootKeyHex);
    const derived = await hkdfDerive(dhSecret, rootSalt, 'NEXUS_RATCHET_KDF_RK', 64);

    session.rootKeyHex = bytesToHex(derived.slice(0, 32));
    session.sendingChainKeyHex = bytesToHex(derived.slice(32, 64));
    session.localDhPublicKeyHex = newLocalDhPubHex;
    session.localDhPrivateKeyJwk = newLocalDhPrivJwk;
    session.lastDhSentToRemote = session.remoteDhPublicKeyHex;
    session.previousCounter = session.sendSequenceNumber;
    session.sendSequenceNumber = 0;
  }

  // Symmetric ratchet step
  const { nextChainKeyHex, messageKeyBytes } = await stepKdfChain(session.sendingChainKeyHex);
  session.sendingChainKeyHex = nextChainKeyHex;

  const currentSeq = session.sendSequenceNumber;
  session.sendSequenceNumber += 1;

  // Encrypt with AES-256-GCM
  const { ciphertextHex, ivHex, authTagHex } = await encryptAesGcm(plaintext, messageKeyBytes);

  return {
    ciphertextHex,
    ivHex,
    authTagHex,
    ephemeralDhPubKeyHex: session.localDhPublicKeyHex,
    sequenceNumber: currentSeq,
    previousChainLength: session.previousCounter,
  };
}

// Decrypt an incoming message, performing DH ratchet steps as needed
export async function ratchetDecrypt(
  session: ActiveRatchetSession,
  envelope: {
    ephemeralDhPubKeyHex: string;
    sequenceNumber: number;
    previousChainLength: number;
    ciphertextHex: string;
    ivHex: string;
    authTagHex: string;
  }
): Promise<string> {
  // If remote sent a new DH public key, perform DH receive ratchet step
  if (envelope.ephemeralDhPubKeyHex && envelope.ephemeralDhPubKeyHex !== session.remoteDhPublicKeyHex) {
    const localPrivKey = await importPrivateKeyFromJwk(session.localDhPrivateKeyJwk);
    const remotePubKey = await importPublicKeyFromHex(envelope.ephemeralDhPubKeyHex);
    const dhSecret = await computeDiffieHellman(localPrivKey, remotePubKey);

    const rootSalt = hexToBytes(session.rootKeyHex);
    const derived = await hkdfDerive(dhSecret, rootSalt, 'NEXUS_RATCHET_KDF_RK', 64);

    session.rootKeyHex = bytesToHex(derived.slice(0, 32));
    session.receivingChainKeyHex = bytesToHex(derived.slice(32, 64));
    session.remoteDhPublicKeyHex = envelope.ephemeralDhPubKeyHex;
    session.receiveSequenceNumber = 0;
  }

  // Advance receiving symmetric chain until reaching sequence number
  while (session.receiveSequenceNumber < envelope.sequenceNumber) {
    const { nextChainKeyHex, messageKeyBytes } = await stepKdfChain(session.receivingChainKeyHex);
    session.receivingChainKeyHex = nextChainKeyHex;

    // Save skipped message key for late-arriving messages
    const skippedKeyId = `${envelope.ephemeralDhPubKeyHex}:${session.receiveSequenceNumber}`;
    session.skippedKeys[skippedKeyId] = bytesToHex(messageKeyBytes);
    session.receiveSequenceNumber += 1;
  }

  // Derive target message key
  const { nextChainKeyHex, messageKeyBytes } = await stepKdfChain(session.receivingChainKeyHex);
  session.receivingChainKeyHex = nextChainKeyHex;
  session.receiveSequenceNumber += 1;

  // Decrypt with AES-256-GCM
  const plaintext = await decryptAesGcm(
    envelope.ciphertextHex,
    envelope.ivHex,
    envelope.authTagHex,
    messageKeyBytes
  );

  return plaintext;
}
