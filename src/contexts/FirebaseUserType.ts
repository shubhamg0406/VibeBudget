// Minimal type definition for backward compatibility after Firebase SDK removal.
// Provides the Firebase User shape so consuming components compile without the firebase package.
// Phase 3 migration: this file exists only to avoid churning every component import.
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerId: string;
  providerData: Array<{
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    email: string | null;
    phoneNumber: string | null;
    providerId: string;
  }>;
  emailVerified: boolean;
  isAnonymous: boolean;
  metadata: Record<string, unknown>;
  refreshToken: string;
  tenantId: string | null;
  toJSON: () => Record<string, unknown>;
  delete: () => Promise<void>;
  reload: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}
