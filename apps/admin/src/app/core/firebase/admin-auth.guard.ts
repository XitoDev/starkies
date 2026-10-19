import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { FirebaseClientService } from './firebase-client.service';

function waitForInitialUser(firebase: FirebaseClientService): Promise<import('firebase/auth').User | null> {
  return new Promise((resolve, reject) => {
    try {
      let unsubscribe: () => void = () => undefined;
      unsubscribe = onAuthStateChanged(
        firebase.auth,
        (user) => {
          unsubscribe();
          resolve(user);
        },
        (error) => {
          unsubscribe();
          reject(error);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

export const adminAuthGuard: CanActivateFn = async (_route, state) => {
  const firebase = inject(FirebaseClientService);
  const router = inject(Router);

  if (!firebase.isConfigured) {
    return router.createUrlTree(['/login'], {
      queryParams: { setup: 'firebase', returnUrl: state.url },
    });
  }

  try {
    const user = await waitForInitialUser(firebase);
    if (!user) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    const adminRef = doc(firebase.firestore, 'adminUsers', user.uid);
    const adminDoc = await getDoc(adminRef);
    if (!adminDoc.exists()) {
      await firebase.signOut();
      return router.createUrlTree(['/login'], { queryParams: { denied: '1' } });
    }

    return true;
  } catch {
    return router.createUrlTree(['/login'], { queryParams: { error: 'auth-check' } });
  }
};
