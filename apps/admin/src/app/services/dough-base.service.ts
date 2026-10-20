import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { FirestoreBusinessRepository } from '../core/firebase/firestore-business.repository';

export type DoughBaseIngredient = {
  ingredientId: string;
  quantity: number;
};

export type DoughBaseRecord = {
  id: string;
  name: string;
  weight: number;
  ingredients: DoughBaseIngredient[];
  notes?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

type RawRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class DoughBaseService {
  private readonly data = inject(DataService);
  private readonly repository = inject(FirestoreBusinessRepository);

  list(): DoughBaseRecord[] {
    const raw = this.data.rawState()?.['doughBases'];
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is DoughBaseRecord => this.isRecord(item))
      .map((item, index) => ({
        ...item,
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? ''),
        weight: Number(item['weight'] ?? 0),
        ingredients: this.readIngredients(item),
        sortOrder: Number.isFinite(Number(item['sortOrder'])) ? Number(item['sortOrder']) : index,
      }))
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  }

  async save(base: DoughBaseRecord): Promise<void> {
    const state = this.data.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    const current = this.list();
    const existing = current.find(item => item.id === base.id);
    const saved: DoughBaseRecord = {
      ...existing,
      ...base,
      id: base.id,
      name: base.name.trim(),
      weight: Number(base.weight),
      ingredients: base.ingredients.map(row => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) })),
      notes: base.notes?.trim() || undefined,
      sortOrder: existing?.sortOrder ?? current.length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repository.upsertCollectionRecord('doughBases', saved.id, saved as unknown as RawRecord);
    const rawBases = Array.isArray(state['doughBases']) ? state['doughBases'] as RawRecord[] : [];
    const nextBases = rawBases.filter(item => String(item['id'] ?? '') !== saved.id);
    nextBases.push(saved as unknown as RawRecord);
    this.data.rawState.set({ ...state, doughBases: nextBases });
  }

  async move(id: string, direction: -1 | 1): Promise<void> {
    const state = this.data.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const bases = this.list();
    const index = bases.findIndex(base => base.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= bases.length) return;
    [bases[index], bases[target]] = [bases[target], bases[index]];
    const next = bases.map((base, sortOrder) => ({ ...base, sortOrder, updatedAt: new Date().toISOString() }));
    for (const base of next) {
      await this.repository.upsertCollectionRecord('doughBases', base.id, base as unknown as RawRecord);
    }
    this.data.rawState.set({ ...state, doughBases: next });
  }

  async delete(id: string): Promise<void> {
    const state = this.data.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const usedBy = this.data.recipes().find(recipe => recipe.baseId === id);
    if (usedBy) throw new Error(`No se puede eliminar esta masa base porque la utiliza la receta «${usedBy.name}».`);
    await this.repository.deleteCollectionRecord('doughBases', id);
    const nextBases = this.list().filter(base => base.id !== id)
      .map((base, sortOrder) => ({ ...base, sortOrder }));
    this.data.rawState.set({ ...state, doughBases: nextBases });
  }

  private readIngredients(value: RawRecord): DoughBaseIngredient[] {
    const raw = Array.isArray(value['ingredients']) ? value['ingredients']
      : Array.isArray(value['items']) ? value['items'] : [];
    return raw.filter(item => this.isRecord(item)).map(item => ({
      ingredientId: String(item['ingredientId'] ?? item['id'] ?? ''),
      quantity: Number(item['quantity'] ?? item['qty'] ?? 0),
    }));
  }

  private isRecord(value: unknown): value is RawRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}