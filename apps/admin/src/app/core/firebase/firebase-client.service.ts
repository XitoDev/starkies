import { Injectable } from '@angular/core';
import { FirebaseApp, getApp, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  getAuth,
  onAuthStateChanged,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { firebaseWebConfig } from './firebase.config';

const PLACEHOLDER = 'REPLACE_WITH_';

@Injectable({ providedIn: 'root' })
export class FirebaseClientService {
  private appInstance: FirebaseApp | null = null;

  get isConfigured(): boolean {
    return Boolean(
      firebaseWebConfig.apiKey &&
      !firebaseWebConfig.apiKey.startsWith(PLACEHOLDER) &&
      firebaseWebConfig.authDomain &&
      !firebaseWebConfig.authDomain.startsWith(PLACEHOLDER) &&
      firebaseWebConfig.projectId &&
      firebaseWebConfig.appId &&
      !firebaseWebConfig.appId.startsWith(PLACEHOLDER),
    );
  }

  get configurationMessage(): string {
    return this.isConfigured
      ? 'Firebase web configuration is present.'
      : 'Firebase is not connected yet. Fill apps/admin/src/app/core/firebase/firebase.config.ts with the web-app config from Firebase Console.';
  }

  get app(): FirebaseApp {
    if (!this.isConfigured) {
      throw new Error(this.configurationMessage);
    }

    if (!this.appInstance) {
      try {
        this.appInstance = getApp();
      } catch {
        this.appInstance = initializeApp(firebaseWebConfig);
      }
    }

    return this.appInstance;
  }

  get auth(): Auth {
    return getAuth(this.app);
  }

  get firestore(): Firestore {
    return getFirestore(this.app);
  }

  setDevicePersistence(rememberDevice: boolean): Promise<void> {
    return setPersistence(
      this.auth,
      rememberDevice ? browserLocalPersistence : browserSessionPersistence,
    );
  }

  signIn(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  signOut() {
    return signOut(this.auth);
  }

  onUserChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(this.auth, callback);
  }
}
