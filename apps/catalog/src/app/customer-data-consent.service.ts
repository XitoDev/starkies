import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type CustomerDataConsent = 'unknown' | 'accepted' | 'declined';

const CONSENT_COOKIE = 'starkies_customer_data_consent';
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

@Injectable({ providedIn: 'root' })
export class CustomerDataConsentService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  readonly status = signal<CustomerDataConsent>('unknown');
  readonly preferencesOpen = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const saved = this.readCookie();
    this.status.set(saved);
    this.preferencesOpen.set(saved === 'unknown');
  }

  hasAccepted(): boolean {
    return this.status() === 'accepted';
  }

  accept(): void {
    this.saveChoice('accepted');
  }

  decline(): void {
    this.saveChoice('declined');
  }

  openPreferences(): void {
    this.preferencesOpen.set(true);
  }

  keepCurrentChoice(): void {
    if (this.status() !== 'unknown') this.preferencesOpen.set(false);
  }

  private saveChoice(choice: Exclude<CustomerDataConsent, 'unknown'>): void {
    this.status.set(choice);
    this.preferencesOpen.set(false);

    if (!isPlatformBrowser(this.platformId)) return;
    const secure = this.document.location?.protocol === 'https:' ? '; Secure' : '';
    this.document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  }

  private readCookie(): CustomerDataConsent {
    const prefix = CONSENT_COOKIE + '=';
    const cookie = this.document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    const value = cookie?.slice(prefix.length);
    return value === 'accepted' || value === 'declined' ? value : 'unknown';
  }
}
