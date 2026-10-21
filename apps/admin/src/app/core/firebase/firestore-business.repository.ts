import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  DocumentSnapshot,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { CashMovement } from 'shared';
import { FirebaseClientService } from './firebase-client.service';
import { FirestoreBackupArchiveService } from './firestore-backup-archive.service';

export interface StarKiesBackupFile {
  business?: string;
  exportedAt?: string;
  state: Record<string, unknown>;
}

interface StateMetadata {
  status?: 'in-progress' | 'complete';
  stateKeys?: string[];
  arrayKeys?: string[];
  settingKeys?: string[];
  sourceBackupId?: string;
  sourceExportedAt?: string;
  recordCounts?: Record<string, number>;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class FirestoreBusinessRepository {
  private readonly stateMetaRef = () =>
    doc(this.firebase.firestore, 'system', 'stateMeta');

  private readonly stateCacheTtlMs = 15_000;
  private stateCache: { value: Record<string, unknown> | null; expiresAt: number } | null = null;
  private stateLoadPromise: Promise<Record<string, unknown> | null> | null = null;
  private cacheGeneration = 0;

  constructor(
    private readonly firebase: FirebaseClientService,
    private readonly archiveService: FirestoreBackupArchiveService,
  ) {}

  /**
   * Reuses a recent complete business snapshot and coalesces simultaneous reads.
   * Writes invalidate the cache; the short TTL also bounds staleness from other sessions.
   */
  async loadState(): Promise<Record<string, unknown> | null> {
    if (this.stateCache && this.stateCache.expiresAt > Date.now()) {
      return this.cloneState(this.stateCache.value);
    }
    if (this.stateLoadPromise) {
      return this.stateLoadPromise.then((state) => this.cloneState(state));
    }

    const generation = this.cacheGeneration;
    const request = this.fetchStateFromFirestore();
    this.stateLoadPromise = request;
    try {
      const state = await request;
      if (generation === this.cacheGeneration) {
        this.stateCache = { value: this.cloneState(state), expiresAt: Date.now() + this.stateCacheTtlMs };
      }
      return this.cloneState(state);
    } finally {
      if (this.stateLoadPromise === request) this.stateLoadPromise = null;
    }
  }

  invalidateStateCache(): void {
    this.cacheGeneration++;
    this.stateCache = null;
  }

  private cloneState(state: Record<string, unknown> | null): Record<string, unknown> | null {
    return state === null ? null : structuredClone(state);
  }

  async hasCompletedMigration(): Promise<boolean> {
    if (!this.firebase.isConfigured) return false;
    const snapshot = await getDoc(this.stateMetaRef());
    return snapshot.exists() && snapshot.data()['status'] === 'complete';
  }

  private async fetchStateFromFirestore(): Promise<Record<string, unknown> | null> {
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const metadataSnapshot = await getDoc(this.stateMetaRef());
    if (!metadataSnapshot.exists()) return null;

    const metadata = metadataSnapshot.data() as StateMetadata;
    if (metadata.status !== 'complete') return null;

    const arrayKeys = metadata.arrayKeys ?? [];
    const settingKeys = metadata.settingKeys ?? [];
    const state: Record<string, unknown> = {};

    await Promise.all(arrayKeys.map(async (key) => {
      const recordsRef = collection(
        this.firebase.firestore,
        key,
      );
      const recordsSnapshot = await getDocs(query(recordsRef, orderBy('index', 'asc')));
      state[key] = recordsSnapshot.docs.map((record) => record.data()['value']);
    }));

    await Promise.all(settingKeys.map(async (key) => {
      const settingSnapshot = await getDoc(
        doc(this.firebase.firestore, 'settings', key),
      );
      if (settingSnapshot.exists()) state[key] = settingSnapshot.data()['value'];
    }));

    return state;
  }

  /**
   * Upserts one record inside an imported business collection while preserving
   * the original numeric order. Deleted records may leave index gaps; this is
   * intentional because loadState orders by index and does not require gaps to
   * be compacted.
   */
  async upsertCollectionRecord(collectionKey: string, recordId: string, value: Record<string, unknown>): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const safeValue = this.removeUndefinedFields(value);
    const recordRef = doc(this.firebase.firestore, collectionKey, recordId);
    const existing = await getDoc(recordRef);
    const index = existing.exists() ? Number(existing.data()['index'] ?? 0) : Date.now();
    await setDoc(recordRef, { index, value: safeValue });
    this.invalidateStateCache();
  }

  async deleteCollectionRecord(collectionKey: string, recordId: string): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const recordsRef = collection(
      this.firebase.firestore,
      collectionKey,
    );
    const snapshot = await getDocs(query(recordsRef, orderBy('index', 'asc')));
    const matching = snapshot.docs.find((record) => {
      const storedValue = record.data()['value'];
      return this.isRecord(storedValue)
        && String(storedValue['id'] ?? storedValue['code'] ?? '') === recordId;
    });

    if (!matching) {
      throw new Error('No se encontró el registro que intentas eliminar. Actualiza la pantalla e inténtalo de nuevo.');
    }

    await deleteDoc(matching.ref);
    this.invalidateStateCache();
  }

  async upsertBusinessSetting(key: string, value: unknown): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error('Firebase no está configurado.');
    }
    const metadataRef = this.stateMetaRef();
    const metadataSnapshot = await getDoc(metadataRef);
    if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
      throw new Error('La migración de StarKies no está completa. No se guardó la configuración.');
    }
    const metadata = metadataSnapshot.data() as StateMetadata;
    await setDoc(
      doc(this.firebase.firestore, 'settings', key),
      { value },
      { merge: true },
    );
    await setDoc(metadataRef, {
      settingKeys: Array.from(new Set([...(metadata.settingKeys ?? []), key])),
      stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), key])),
    }, { merge: true });
    this.invalidateStateCache();
  }

  /**
   * Atomically records a production run, deducts its recipe ingredients from
   * inventory, and registers the new productionHistory collection in metadata.
   */
  async recordProduction(
    record: Record<string, unknown>,
    deductions: { ingredientId: string; quantity: number }[],
  ): Promise<void> {
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const productionId = String(record['id'] ?? '').trim();
    if (!productionId) throw new Error('El lote necesita un identificador.');

    const metadataRef = this.stateMetaRef();
    const metadataSnapshot = await getDoc(metadataRef);
    if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
      throw new Error('La migración de StarKies no está completa. No se registró el lote.');
    }

    const totals = new Map<string, number>();
    for (const deduction of deductions) {
      if (!deduction.ingredientId || !Number.isFinite(deduction.quantity) || deduction.quantity <= 0) {
        throw new Error('La fórmula contiene una cantidad de ingrediente no válida.');
      }
      totals.set(deduction.ingredientId, (totals.get(deduction.ingredientId) ?? 0) + deduction.quantity);
    }

    const ingredientsRef = collection(
      this.firebase.firestore,
      'ingredients',
    );
    const ingredientSnapshot = await getDocs(query(ingredientsRef, orderBy('index', 'asc')));
    const ingredientDocs: { ingredientId: string; quantity: number; ref: (typeof ingredientSnapshot.docs)[number] }[] = [];

    for (const [ingredientId, quantity] of totals.entries()) {
      const matching = ingredientSnapshot.docs.find((snapshot) => {
        const stored = snapshot.data()['value'];
        return this.isRecord(stored) && String(stored['id'] ?? '') === ingredientId;
      });
      if (!matching) {
        throw new Error('No se encontró uno de los ingredientes de la receta. Revisa la fórmula antes de producir.');
      }
      ingredientDocs.push({ ingredientId, quantity, ref: matching });
    }

    const productionRef = collection(
      this.firebase.firestore,
      'productionHistory',
    );
    const newProductionRef = doc(productionRef, productionId);

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const currentMetadataSnapshot = await transaction.get(metadataRef);
      if (!currentMetadataSnapshot.exists() || currentMetadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies ya no está disponible. No se registró el lote.');
      }

      const currentIngredientSnapshots: DocumentSnapshot[] = [];
      for (const ingredientDoc of ingredientDocs) {
        currentIngredientSnapshots.push(await transaction.get(ingredientDoc.ref.ref));
      }
      const existingProductionSnapshot = await transaction.get(newProductionRef);
      if (existingProductionSnapshot.exists()) {
        throw new Error('Este lote ya existe. Actualiza la pantalla antes de volver a intentarlo.');
      }

      const updates: { ref: (typeof ingredientDocs)[number]['ref']['ref']; index: number; value: Record<string, unknown> }[] = [];
      ingredientDocs.forEach((ingredientDoc, index) => {
        const snapshot = currentIngredientSnapshots[index];
        if (!snapshot.exists()) {
          throw new Error('Uno de los ingredientes cambió durante el registro. Actualiza la pantalla e inténtalo de nuevo.');
        }
        const data = snapshot.data();
        const stored = data['value'];
        if (!this.isRecord(stored)) {
          throw new Error('No se pudo leer uno de los ingredientes. No se registró el lote.');
        }

        const currentStock = Number(stored['stock'] ?? 0);
        if (!Number.isFinite(currentStock) || currentStock < ingredientDoc.quantity) {
          const ingredientName = String(stored['name'] ?? ingredientDoc.ingredientId);
          throw new Error(`Stock insuficiente de "${ingredientName}". Se necesitan ${ingredientDoc.quantity} y hay ${currentStock}.`);
        }

        updates.push({
          ref: ingredientDoc.ref.ref,
          index: Number(data['index'] ?? 0),
          value: { ...stored, stock: currentStock - ingredientDoc.quantity },
        });
      });

      const metadata = currentMetadataSnapshot.data() as StateMetadata;
      const arrayKeys = Array.from(new Set([...(metadata.arrayKeys ?? []), 'productionHistory']));
      const stateKeys = Array.from(new Set([...(metadata.stateKeys ?? []), 'productionHistory']));
      const counts = metadata.recordCounts ?? {};

      for (const update of updates) {
        transaction.set(update.ref, { index: update.index, value: update.value });
      }
      transaction.set(newProductionRef, {
        index: Date.now(),
        value: record,
      });
      transaction.set(metadataRef, {
        arrayKeys,
        stateKeys,
        recordCounts: {
          ...counts,
          productionHistory: Number(counts['productionHistory'] ?? 0) + 1,
        },
      }, { merge: true });
    });
  }

  async recordCashMovement(movement: CashMovement): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }
    this.validateCashMovement(movement);

    const metadataRef = this.stateMetaRef();
    const movementRef = doc(
      this.firebase.firestore,
      'cashMovements', movement.id,
    );

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const metadataSnapshot = await transaction.get(metadataRef);
      const existingMovement = await transaction.get(movementRef);
      if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies no está completa. No se registró el movimiento.');
      }
      if (existingMovement.exists()) {
        throw new Error('Este movimiento ya existe. Actualiza la pantalla e inténtalo de nuevo.');
      }

      const metadata = metadataSnapshot.data() as StateMetadata;
      const counts = metadata.recordCounts ?? {};
      const nextCount = Number(counts['cashMovements'] ?? 0) + 1;
      transaction.set(movementRef, { index: Date.now(), value: movement });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...(metadata.arrayKeys ?? []), 'cashMovements'])),
        stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), 'cashMovements'])),
        recordCounts: { ...counts, cashMovements: nextCount },
      }, { merge: true });
    });
  }

  /**
   * Records the cash outflow and stock increase in one Firestore transaction.
   * The ingredient cost is updated using a weighted average, so inventory value
   * remains consistent after purchases at different unit prices.
   */
  async recordIngredientPurchase(movement: CashMovement): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const ingredientId = String(movement.ingredientId ?? '').trim();
    const quantity = Number(movement.quantity);
    const unitCost = Number(movement.unitCost);
    if (!ingredientId) throw new Error('Selecciona el insumo de la compra.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad comprada debe ser mayor que cero.');
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error('El costo por unidad debe ser mayor que cero.');
    }

    const amount = Math.round(quantity * unitCost * 100) / 100;
    const savedMovement: CashMovement = {
      ...movement,
      type: 'OUT',
      category: 'compra_insumo',
      amount,
    };
    this.validateCashMovement(savedMovement);

    const ingredientsRef = collection(
      this.firebase.firestore,
      'ingredients',
    );
    const ingredientSnapshot = await getDocs(query(ingredientsRef, orderBy('index', 'asc')));
    const matchingIngredient = ingredientSnapshot.docs.find((snapshot) => {
      const stored = snapshot.data()['value'];
      return this.isRecord(stored) && String(stored['id'] ?? '') === ingredientId;
    });
    if (!matchingIngredient) {
      throw new Error('No se encontró el insumo seleccionado. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const metadataRef = this.stateMetaRef();
    const movementRef = doc(
      this.firebase.firestore,
      'cashMovements', savedMovement.id,
    );

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const metadataSnapshot = await transaction.get(metadataRef);
      const currentIngredientSnapshot = await transaction.get(matchingIngredient.ref);
      const existingMovement = await transaction.get(movementRef);

      if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies no está completa. No se registró la compra.');
      }
      if (!currentIngredientSnapshot.exists()) {
        throw new Error('El insumo cambió durante el registro. Actualiza la pantalla e inténtalo de nuevo.');
      }
      if (existingMovement.exists()) {
        throw new Error('Esta compra ya existe. Actualiza la pantalla e inténtalo de nuevo.');
      }

      const stored = currentIngredientSnapshot.data()['value'];
      if (!this.isRecord(stored)) {
        throw new Error('No se pudo leer el insumo seleccionado. No se registró la compra.');
      }

      const currentStock = Number(stored['stock'] ?? 0);
      const currentUnitCost = Number(stored['costPerUnit'] ?? stored['cost'] ?? 0);
      if (!Number.isFinite(currentStock) || currentStock < 0
        || !Number.isFinite(currentUnitCost) || currentUnitCost < 0) {
        throw new Error('El stock o costo actual del insumo no es válido. Corrige el inventario antes de comprar.');
      }

      const nextStock = currentStock + quantity;
      const weightedAverageCost = (currentStock * currentUnitCost + quantity * unitCost) / nextStock;
      const updatedIngredient: Record<string, unknown> = {
        ...stored,
        stock: nextStock,
        costPerUnit: weightedAverageCost,
      };
      // Preserve compatibility with backups whose original field was named "cost".
      if (Object.prototype.hasOwnProperty.call(stored, 'cost')) {
        updatedIngredient['cost'] = weightedAverageCost;
      }

      const metadata = metadataSnapshot.data() as StateMetadata;
      const counts = metadata.recordCounts ?? {};
      const nextCount = Number(counts['cashMovements'] ?? 0) + 1;
      transaction.set(currentIngredientSnapshot.ref, {
        index: Number(currentIngredientSnapshot.data()['index'] ?? 0),
        value: updatedIngredient,
      });
      transaction.set(movementRef, { index: Date.now(), value: savedMovement });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...(metadata.arrayKeys ?? []), 'cashMovements'])),
        stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), 'cashMovements'])),
        recordCounts: { ...counts, cashMovements: nextCount },
      }, { merge: true });
    });
  }

  private validateCashMovement(movement: CashMovement): void {
    if (!movement.id?.trim()) throw new Error('El movimiento necesita un identificador.');
    if (!movement.description?.trim()) throw new Error('Ingresa una descripción para el movimiento.');
    if (!movement.date?.trim() || !Number.isFinite(Date.parse(movement.date))) {
      throw new Error('Selecciona una fecha válida para el movimiento.');
    }
    if (movement.type !== 'IN' && movement.type !== 'OUT') {
      throw new Error('El tipo de movimiento no es válido.');
    }
    if (!Number.isFinite(movement.amount) || movement.amount <= 0) {
      throw new Error('El monto debe ser mayor que cero.');
    }
    if (!movement.category?.trim()) throw new Error('Selecciona una categoría para el movimiento.');
  }

  async importInitialBackup(backup: StarKiesBackupFile): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }
    if (!this.isRecord(backup) || !this.isRecord(backup.state)) {
      throw new Error('El archivo no tiene el formato de respaldo StarKies esperado. No se ha importado nada.');
    }

    const stateEntries = Object.entries(backup.state);
    if (stateEntries.length === 0) {
      throw new Error('El respaldo no contiene datos de negocio. No se ha importado nada.');
    }

    const stateKeys = stateEntries.map(([key]) => key);
    const arrayKeys = stateEntries.filter(([, value]) => Array.isArray(value)).map(([key]) => key);
    const settingKeys = stateEntries.filter(([, value]) => !Array.isArray(value)).map(([key]) => key);
    const sourceExportedAt = backup.exportedAt ?? 'unknown-date';
    const archiveId = `original-${sourceExportedAt.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const metaRef = this.stateMetaRef();

    const before = await getDoc(metaRef);
    let isResume = false;

    if (before.exists()) {
      const metadata = before.data() as StateMetadata;
      if (metadata.status === 'complete') {
        throw new Error('StarKies ya tiene una migración completa en Firebase. Se rechazó la importación para proteger los datos existentes.');
      }
      if (metadata.status !== 'in-progress' || metadata.sourceExportedAt !== sourceExportedAt) {
        throw new Error('Existe una migración incompleta de otro respaldo. No se sobrescribió ningún dato; revisa el estado de migración antes de continuar.');
      }
      isResume = true;
    } else {
      await this.assertDestinationIsEmpty(arrayKeys, settingKeys);
    }

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const current = await transaction.get(metaRef);
      if (current.exists()) {
        const metadata = current.data() as StateMetadata;
        if (metadata.status === 'complete') {
          throw new Error('StarKies ya tiene una migración completa en Firebase. Se rechazó la importación.');
        }
        if (metadata.status !== 'in-progress' || metadata.sourceExportedAt !== sourceExportedAt) {
          throw new Error('Cambió el estado de migración mientras se preparaba la importación. No se escribieron nuevos registros.');
        }
      } else {
        transaction.set(metaRef, {
          status: 'in-progress',
          schemaVersion: 1,
          stateKeys,
          arrayKeys,
          settingKeys,
          sourceBackupId: archiveId,
          sourceExportedAt,
          startedAt: new Date().toISOString(),
        });
      }
    });

    const archiveRef = doc(
      this.firebase.firestore,
      'migrationArchives', archiveId,
    );
    const archiveSnapshot = await getDoc(archiveRef);
    if (!archiveSnapshot.exists()) {
      await this.archiveService.archiveOriginalBackup(backup, archiveId);
    } else if (!isResume) {
      throw new Error('Ya existe un archivo con ese identificador y no hay una migración en curso. No se sobrescribió.');
    }

    let batch = writeBatch(this.firebase.firestore);
    let operations = 0;
    const flushIfFull = async () => {
      if (operations >= 400) {
        await batch.commit();
        batch = writeBatch(this.firebase.firestore);
        operations = 0;
      }
    };

    for (const [key, value] of stateEntries) {
      if (Array.isArray(value)) {
        value.forEach((record, index) => {
          const rawRecord = this.isRecord(record) ? record : {};
          const candidateId = String(rawRecord['id'] ?? rawRecord['code'] ?? '').trim();
          const recordId = candidateId && !candidateId.includes('/') ? candidateId : String(index).padStart(6, '0');
          const recordRef = doc(
            this.firebase.firestore,
            key, recordId,
          );
          batch.set(recordRef, { index, value: record });
          operations += 1;
        });
        await flushIfFull();
      } else {
        const settingRef = doc(this.firebase.firestore, 'settings', key);
        batch.set(settingRef, { value });
        operations += 1;
        await flushIfFull();
      }
    }

    if (operations > 0) await batch.commit();

    await setDoc(metaRef, {
      status: 'complete',
      schemaVersion: 1,
      stateKeys,
      arrayKeys,
      settingKeys,
      sourceBackupId: archiveId,
      sourceExportedAt,
      importedAt: new Date().toISOString(),
      recordCounts: Object.fromEntries(
        stateEntries
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as unknown[]).length]),
      ),
    }, { merge: true });
  }

  private async assertDestinationIsEmpty(arrayKeys: string[], settingKeys: string[]): Promise<void> {
    const existingArrays = await Promise.all(arrayKeys.map(async (key) => {
      const snapshot = await getDocs(collection(
        this.firebase.firestore,
        key,
      ));
      return snapshot.empty ? null : key;
    }));

    const existingSettings = await Promise.all(settingKeys.map(async (key) => {
      const snapshot = await getDoc(
        doc(this.firebase.firestore, 'settings', key),
      );
      return snapshot.exists() ? key : null;
    }));

    const conflicts = [...existingArrays, ...existingSettings].filter((key): key is string => Boolean(key));
    if (conflicts.length) {
      throw new Error(`Ya hay datos en Firebase (${conflicts.slice(0, 5).join(', ')}). Se canceló la importación para no sobrescribirlos.`);
    }
  }

  /**
   * Recursively removes undefined object properties before sending values to
   * Firestore. Undefined array slots become null to preserve array positions.
   * Non-plain objects (Date, Firestore Timestamp, etc.) are preserved.
   */
  private removeUndefinedFields<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => item === undefined ? null : this.removeUndefinedFields(item)) as T;
    }
    if (value === null || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child !== undefined) result[key] = this.removeUndefinedFields(child);
    }
    return result as T;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}