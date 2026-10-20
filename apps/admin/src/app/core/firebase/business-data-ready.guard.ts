import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FirestoreBusinessRepository } from './firestore-business.repository';

export const businessDataReadyGuard: CanActivateFn = async () => {
  const repository = inject(FirestoreBusinessRepository);
  const router = inject(Router);

  try {
    return await repository.hasCompletedMigration()
      ? true
      : router.createUrlTree(['/migracion']);
  } catch {
    return router.createUrlTree(['/migracion'], {
      queryParams: { error: 'firestore-check' },
    });
  }
};
