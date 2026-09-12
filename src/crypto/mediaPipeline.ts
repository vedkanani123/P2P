/**
 * NEXUS - Zero-Knowledge Media & File Pipeline
 * Layer 4: Encrypted Content-Addressed Chunks
 *
 * Rules:
 * 1. File Key generated randomly on device (never sent to server).
 * 2. File encrypted client-side with AES-256-GCM.
 * 3. Split into content-addressed chunks (each has a SHA-256 CID).
 * 4. File key is wrapped in the session ratchet message.
 * 5. Recipient decrypts client-side and renders locally. Server NEVER sees an image.
 */

import {
  bytesToHex,
  encryptAesGcm,
  decryptAesGcm,
  generateContentId,
} from './webCrypto';
import { EncryptedMediaPayload } from '../types';

export interface ChunkRecord {
  cid: string;
  chunkIndex: number;
  totalChunks: number;
  encryptedBytesHex: string;
}

// In-memory chunk store representing distributed storage nodes
const distributedChunkStore = new Map<string, ChunkRecord>();

export async function encryptAndChunkFile(
  file: File | { name: string; type: string; dataUrl: string }
): Promise<{
  payload: EncryptedMediaPayload;
  fileKeyHex: string;
}> {
  // 1. Generate one-time 256-bit File Key
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : window.crypto;
  const fileKeyBytes = cryptoObj.getRandomValues(new Uint8Array(32));
  const fileKeyHex = bytesToHex(fileKeyBytes);

  let rawBytes: Uint8Array;
  let fileName: string;
  let fileType: string;

  if (file instanceof File) {
    fileName = file.name;
    fileType = file.type;
    const arrayBuffer = await file.arrayBuffer();
    rawBytes = new Uint8Array(arrayBuffer);
  } else {
    fileName = file.name;
    fileType = file.type;
    const base64Data = file.dataUrl.split(',')[1] || '';
    const binary = atob(base64Data);
    rawBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      rawBytes[i] = binary.charCodeAt(i);
    }
  }

  // 2. Encrypt with AES-256-GCM
  const { ciphertextHex, ivHex, authTagHex } = await encryptAesGcm(rawBytes, fileKeyBytes);
  const fullEncryptedPayload = `${ivHex}:${authTagHex}:${ciphertextHex}`;

  // 3. Split into 64KB chunks and assign CIDs
  const chunkSize = 64 * 1024;
  const totalChunks = Math.ceil(fullEncryptedPayload.length / chunkSize);
  const chunkCids: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const chunkStr = fullEncryptedPayload.substring(start, start + chunkSize);
    const chunkCid = await generateContentId(chunkStr);
    chunkCids.push(chunkCid);

    distributedChunkStore.set(chunkCid, {
      cid: chunkCid,
      chunkIndex: i,
      totalChunks,
      encryptedBytesHex: chunkStr,
    });
  }

  const rootCid = await generateContentId(chunkCids.join(':'));

  // 4. Generate local client-side thumbnail if image
  let clientThumbnailDataUrl: string | undefined;
  if (fileType.startsWith('image/')) {
    if (file instanceof File) {
      clientThumbnailDataUrl = URL.createObjectURL(file);
    } else {
      clientThumbnailDataUrl = file.dataUrl;
    }
  }

  return {
    payload: {
      fileId: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fileName,
      fileType,
      fileSize: rawBytes.length,
      cid: rootCid,
      chunkCids,
      clientThumbnailDataUrl,
    },
    fileKeyHex,
  };
}

// Recipient reconstructs chunks from storage nodes and decrypts client-side
export async function reassembleAndDecryptFile(
  payload: EncryptedMediaPayload,
  fileKeyHex: string
): Promise<string> {
  // 1. Gather all chunks in order
  let fullEncrypted = '';
  for (const cid of payload.chunkCids) {
    const chunk = distributedChunkStore.get(cid);
    if (!chunk) {
      throw new Error(`Chunk ${cid} not found on storage nodes`);
    }
    fullEncrypted += chunk.encryptedBytesHex;
  }

  // 2. Parse IV, AuthTag, and Ciphertext
  const [ivHex, authTagHex, ciphertextHex] = fullEncrypted.split(':');
  const fileKeyBytes = new Uint8Array(
    fileKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  // 3. Decrypt client-side
  const decryptedText = await decryptAesGcm(ciphertextHex, ivHex, authTagHex, fileKeyBytes);

  // 4. Convert back to object or dataUrl
  const binaryLen = decryptedText.length;
  const bytes = new Uint8Array(binaryLen);
  for (let i = 0; i < binaryLen; i++) {
    bytes[i] = decryptedText.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: payload.fileType });
  return URL.createObjectURL(blob);
}
