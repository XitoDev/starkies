import { Injectable } from '@angular/core';
import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { FirebaseClientService } from './firebase-client.service';

export interface StarkiesBackupArchive {
  archiveId: string;
  byteLength: number;
  createdAt: unknown;
  payload: Record<string, unknown>;
  source: 'manual-backup-import';
}

/**
 * Safety-first archive writer for the original GPT Sites JSON backup.
 *
 * This is intentionally separate from the live business collections. It never
 * imports on application startup and refuses to overwrite an existing archive.
 * The archive is retained separately from flattened live collections and is never used as the active source of truth.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreBackupArchiveService {
  private readonly maxPayloadBytes = 850_000;

  constructor(private readonly firebase: FirebaseClientService) {}

  async archiveOriginalBackup(backup: unknown, archiveId: string): Promise<void> {
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    if (!archiveId.trim() || !/^[a-zA-Z0-9_-]{1,100}$/.test(archiveId)) {
      throw new Error('El identificador del respaldo debe tener entre 1 y 100 caracteres y solo usar letras, números, guiones o guiones bajos.');
    }

    if (!this.isRecord(backup) || !this.isRecord(backup['state'])) {
      throw new Error('El archivo no tiene el formato de respaldo StarKies esperado. No se ha escrito ningún dato.');
    }

    const serialized = JSON.stringify(backup);
    const byteLength = new TextEncoder().encode(serialized).length;
    if (byteLength > this.maxPayloadBytes) {
      throw new Error('El respaldo es demasiado grande para archivarse como un único documento de Firestore. No se ha escrito ningún dato.');
    }

    const archiveRef = doc(
      this.firebase.firestore,
      'migrationArchives',
      archiveId,
    );

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const existing = await transaction.get(archiveRef);
      if (existing.exists()) {
        throw new Error(`Ya existe el archivo de respaldo "${archiveId}". Se rechazó la operación para evitar sobrescribirlo.`);
      }

      transaction.set(archiveRef, {
        source: 'manual-backup-import',
        byteLength,
        createdAt: serverTimestamp(),
        payload: JSON.parse(serialized) as Record<string, unknown>,
      });
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
