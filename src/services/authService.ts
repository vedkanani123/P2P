/**
 * NEXUS - Authentication, Security PIN & Mnemonic Recovery Service
 * Implements client-side Zero-Knowledge account credentials,
 * 4/6-digit App Lock PIN, 12-word recovery mnemonic generation,
 * and multi-device registration.
 */

import { DeviceTelemetry, collectCurrentDeviceTelemetry } from './deviceDetector';

// BIP-39 compatible vocabulary (256 distinct high-entropy English words)
const RECOVERY_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
  'across', 'action', 'actor', 'actual', 'adapt', 'add', 'address', 'adjust',
  'admit', 'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid',
  'again', 'agent', 'agree', 'ahead', 'aim', 'airport', 'aisle', 'alarm',
  'album', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
  'cactus', 'cage', 'cake', 'call', 'calm', 'camera', 'camp', 'can',
  'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas', 'canyon', 'capable',
  'capital', 'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry',
  'cart', 'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog',
];

export interface UserAccount {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  pinHash: string;
  pinLength: 4 | 6;
  secretRecoveryPhrase: string; // 12 space-separated words
  createdAt: number;
  devices: DeviceTelemetry[];
  activeDeviceId: string;
  avatarUrl: string;
  status?: 'online' | 'idle' | 'offline';
}

// Compute initials from first and last name (e.g. "Ved" + "Kanani" -> "VK")
export function getUserInitials(firstName?: string, lastName?: string, fullName?: string): string {
  const f = firstName?.trim() || '';
  const l = lastName?.trim() || '';
  if (f && l) {
    return (f.charAt(0) + l.charAt(0)).toUpperCase();
  }
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  return 'VK';
}

// Simple SHA-256 string hasher
export async function hashString(input: string, salt: string = ''): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Safely compress and resize user profile images to avoid localStorage quota overflow
export function compressImageFile(file: File, maxDim = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate 12 random words from dictionary using crypto.getRandomValues
export function generate12WordRecoveryPhrase(): string {
  const words: string[] = [];
  const randomArray = new Uint8Array(12);
  crypto.getRandomValues(randomArray);

  for (let i = 0; i < 12; i++) {
    const index = randomArray[i] % RECOVERY_WORDLIST.length;
    words.push(RECOVERY_WORDLIST[index]);
  }
  return words.join(' ');
}

// Download the secure recovery phrase file as TXT
export function downloadRecoveryKeyFile(account: {
  fullName: string;
  email: string;
  recoveryPhrase: string;
  accountId: string;
}): void {
  const timestamp = new Date().toISOString();
  const fileContent = `================================================================================
NEXUS ZERO-KNOWLEDGE CRYPTOGRAPHIC RECOVERY KEY
================================================================================
Date Generated: ${timestamp}
Account ID:     ${account.accountId}
Account Holder: ${account.fullName}
Registered Email: ${account.email}

--------------------------------------------------------------------------------
12-WORD MASTER SECRET RECOVERY PHRASE:
--------------------------------------------------------------------------------

  ${account.recoveryPhrase}

--------------------------------------------------------------------------------
CRITICAL SECURITY WARNING:
--------------------------------------------------------------------------------
1. This recovery phrase is your ONLY backup key to recover your end-to-end
   encrypted account and double-ratchet communications if you forget your
   password or security PIN.
2. NEXUS employs strict zero-knowledge architecture: our servers DO NOT store
   your master encryption keys, plaintext password, or recovery phrase.
3. If you lose this recovery phrase and forget your credentials, YOUR ACCOUNT
   AND ALL ENCRYPTED DATA WILL BE PERMANENTLY LOST.
4. Store this document offline in a physically secure location (e.g. encrypted
   USB drive, safe, or hardware vault). Never share it with anyone.
================================================================================
`;

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexus-recovery-phrase-${account.accountId.substring(0, 8)}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const STORAGE_KEY = 'nexus_user_vault_v2';
const APP_LOCK_SESSION_KEY = 'nexus_app_locked_state';

class AuthService {
  private currentAccount: UserAccount | null = null;
  private isLocked: boolean = true;
  private listeners: Array<() => void> = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.currentAccount = JSON.parse(stored);
      }
      // Check if session lock was previously unlocked in this active tab session
      const sessionState = sessionStorage.getItem(APP_LOCK_SESSION_KEY);
      this.isLocked = sessionState !== 'unlocked';
    } catch {
      this.currentAccount = null;
      this.isLocked = true;
    }
  }

  private saveToStorage() {
    if (this.currentAccount) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentAccount));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public getAccount(): UserAccount | null {
    return this.currentAccount;
  }

  public isAuthenticated(): boolean {
    return this.currentAccount !== null;
  }

  public isAppLocked(): boolean {
    // If no account exists, we are not locked in PIN mode (we are in onboarding)
    if (!this.currentAccount) return false;
    return this.isLocked;
  }

  public lockApp(): void {
    this.isLocked = true;
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    this.notify();
  }

  public async unlockWithPin(pinInput: string): Promise<boolean> {
    if (!this.currentAccount) return false;
    const inputHash = await hashString(pinInput, this.currentAccount.passwordSalt);
    if (inputHash === this.currentAccount.pinHash) {
      this.isLocked = false;
      sessionStorage.setItem(APP_LOCK_SESSION_KEY, 'unlocked');
      // Update current device lastActive
      this.updateDeviceActivity();
      this.notify();
      return true;
    }
    return false;
  }

  public async registerAccount(params: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    password: string;
    pin: string;
    pinLength: 4 | 6;
    phrase: string;
  }): Promise<UserAccount> {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const passwordHash = await hashString(params.password, salt);
    const pinHash = await hashString(params.pin, salt);

    // Auto-collect current device hardware & network telemetry
    const device = await collectCurrentDeviceTelemetry();

    const accountId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const newAccount: UserAccount = {
      id: accountId,
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      fullName: params.fullName.trim() || `${params.firstName.trim()} ${params.lastName.trim()}`,
      email: params.email.trim().toLowerCase(),
      passwordHash,
      passwordSalt: salt,
      pinHash,
      pinLength: params.pinLength,
      secretRecoveryPhrase: params.phrase.trim().toLowerCase(),
      createdAt: Date.now(),
      devices: [device],
      activeDeviceId: device.deviceId,
      avatarUrl: '', // Clean default: dual initials will be used until user uploads their custom photo
      status: 'online',
    };

    this.currentAccount = newAccount;
    this.isLocked = false;
    sessionStorage.setItem(APP_LOCK_SESSION_KEY, 'unlocked');
    this.saveToStorage();
    return newAccount;
  }

  public async loginWithPassword(email: string, passwordInput: string): Promise<boolean> {
    if (!this.currentAccount) return false;
    if (this.currentAccount.email !== email.trim().toLowerCase()) return false;

    const inputHash = await hashString(passwordInput, this.currentAccount.passwordSalt);
    if (inputHash === this.currentAccount.passwordHash) {
      // Auto-register or update current device on login
      await this.ensureCurrentDeviceRegistered();
      this.isLocked = false;
      sessionStorage.setItem(APP_LOCK_SESSION_KEY, 'unlocked');
      this.notify();
      return true;
    }
    return false;
  }

  // Account Recovery via Secret Recovery Phrase (12 Words)
  public async recoverWithPhrase(params: {
    email: string;
    recoveryPhrase: string;
    newPassword: string;
    newPin: string;
    newPinLength: 4 | 6;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.currentAccount) {
      return { success: false, error: 'No account registered on this system. Please create a new account.' };
    }

    if (this.currentAccount.email !== params.email.trim().toLowerCase()) {
      return { success: false, error: 'Provided email does not match registered account.' };
    }

    const normalizedStored = this.currentAccount.secretRecoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedInput = params.recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');

    if (normalizedStored !== normalizedInput) {
      return { success: false, error: 'Invalid secret recovery phrase. Verification failed.' };
    }

    // Phrase matches! Update password and PIN with fresh salt
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const newPasswordHash = await hashString(params.newPassword, salt);
    const newPinHash = await hashString(params.newPin, salt);

    this.currentAccount.passwordSalt = salt;
    this.currentAccount.passwordHash = newPasswordHash;
    this.currentAccount.pinHash = newPinHash;
    this.currentAccount.pinLength = params.newPinLength;

    await this.ensureCurrentDeviceRegistered();
    this.isLocked = false;
    sessionStorage.setItem(APP_LOCK_SESSION_KEY, 'unlocked');
    this.saveToStorage();

    return { success: true };
  }

  // Recover/Reset PIN using known Master Password
  public async resetPinWithPassword(params: {
    password: string;
    newPin: string;
    newPinLength: 4 | 6;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.currentAccount) {
      return { success: false, error: 'No active account.' };
    }

    const inputHash = await hashString(params.password, this.currentAccount.passwordSalt);
    if (inputHash !== this.currentAccount.passwordHash) {
      return { success: false, error: 'Incorrect master password.' };
    }

    const newPinHash = await hashString(params.newPin, this.currentAccount.passwordSalt);
    this.currentAccount.pinHash = newPinHash;
    this.currentAccount.pinLength = params.newPinLength;

    this.isLocked = false;
    sessionStorage.setItem(APP_LOCK_SESSION_KEY, 'unlocked');
    this.saveToStorage();
    return { success: true };
  }

  // Auto-detect and register current device into the user's multi-device list
  public async ensureCurrentDeviceRegistered(): Promise<void> {
    if (!this.currentAccount) return;
    const currentTelemetry = await collectCurrentDeviceTelemetry();

    const existingIdx = this.currentAccount.devices.findIndex(
      (d) => d.fingerprint === currentTelemetry.fingerprint || d.deviceId === currentTelemetry.deviceId
    );

    if (existingIdx >= 0) {
      // Update last active, IP, etc.
      this.currentAccount.devices[existingIdx].lastActive = Date.now();
      this.currentAccount.devices[existingIdx].ipAddress = currentTelemetry.ipAddress;
      this.currentAccount.devices[existingIdx].status = 'active';
      this.currentAccount.activeDeviceId = this.currentAccount.devices[existingIdx].deviceId;
    } else {
      // Add new device
      this.currentAccount.devices.push(currentTelemetry);
      this.currentAccount.activeDeviceId = currentTelemetry.deviceId;
    }
    this.saveToStorage();
  }

  public revokeDevice(deviceId: string): void {
    if (!this.currentAccount) return;
    this.currentAccount.devices = this.currentAccount.devices.map((d) =>
      d.deviceId === deviceId ? { ...d, status: 'revoked' as const } : d
    );
    this.saveToStorage();
  }

  public removeDevice(deviceId: string): void {
    if (!this.currentAccount) return;
    this.currentAccount.devices = this.currentAccount.devices.filter((d) => d.deviceId !== deviceId);
    this.saveToStorage();
  }

  public async updateDeviceActivity(): Promise<void> {
    if (!this.currentAccount) return;
    const active = this.currentAccount.devices.find((d) => d.deviceId === this.currentAccount?.activeDeviceId);
    if (active) {
      active.lastActive = Date.now();
      this.saveToStorage();
    }
  }

  public updateProfileAvatar(avatarUrl: string): void {
    if (!this.currentAccount) return;
    this.currentAccount.avatarUrl = avatarUrl;
    this.saveToStorage();
    this.notify();
  }

  public updateUserStatus(status: 'online' | 'idle' | 'offline'): void {
    if (!this.currentAccount) return;
    this.currentAccount.status = status;
    this.saveToStorage();
    this.notify();
  }

  public updateProfile(params: { firstName?: string; lastName?: string; avatarUrl?: string }): void {
    if (!this.currentAccount) return;
    if (params.firstName !== undefined) this.currentAccount.firstName = params.firstName;
    if (params.lastName !== undefined) this.currentAccount.lastName = params.lastName;
    if (params.firstName || params.lastName) {
      this.currentAccount.fullName = `${this.currentAccount.firstName} ${this.currentAccount.lastName}`.trim();
    }
    if (params.avatarUrl !== undefined) this.currentAccount.avatarUrl = params.avatarUrl;
    this.saveToStorage();
    this.notify();
  }

  public logout(): void {
    this.isLocked = true;
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    this.notify();
  }

  // Full sign out / switch account: wipes vault credentials from this browser
  public logoutAccount(): void {
    this.isLocked = true;
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    this.currentAccount = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  // Pre-seed default demo account when user explicitly clicks "Quick Demo Login"
  public async ensureInitialAccount(): Promise<UserAccount> {
    if (this.currentAccount) {
      return this.currentAccount;
    }

    const demoPhrase = 'abandon ability able about above absent absorb abstract access accident account accuse';
    return await this.registerAccount({
      firstName: 'Ved',
      lastName: 'Kanani',
      fullName: 'Ved Kanani',
      email: 'vedkanani34@gmail.com',
      password: 'Password123!',
      pin: '1234',
      pinLength: 4,
      phrase: demoPhrase,
    });
  }
}

export const authService = new AuthService();
