import { TestBed } from '@angular/core/testing';
import { DataService } from './data.service';
import { FirestoreBusinessRepository } from '../core/firebase/firestore-business.repository';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

describe('DataService catalog visibility', () => {
  const repository = {
    loadState: vi.fn().mockResolvedValue(null),
    upsertCollectionRecord: vi.fn().mockResolvedValue(undefined),
    upsertRecipeAndCatalogProjection: vi.fn().mockResolvedValue(undefined),
  };
  let service: DataService;

  beforeEach(() => {
    repository.loadState.mockReset().mockResolvedValue(null);
    repository.upsertCollectionRecord.mockReset().mockResolvedValue(undefined);
    repository.upsertRecipeAndCatalogProjection.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        DataService,
        { provide: FirestoreBusinessRepository, useValue: repository },
        {
          provide: FirebaseClientService,
          useValue: { isConfigured: false, configurationMessage: 'Firebase no configurado' },
        },
      ],
    });
    service = TestBed.inject(DataService);
    service.rawState.set({
      ingredients: [],
      orders: [],
      recipes: [{
        id: '000015',
        name: 'Galleta clásica',
        category: 'Galletas clásicas',
        yield: 12,
        price: 1.5,
        sections: [],
        items: [],
      }],
    });
  });

  it('persists recipe ingredient IDs and quantities in both canonical sections and legacy items', async () => {
    service.rawState.set({
      ingredients: [{ id: 'flour', name: 'Harina', unit: 'g', costPerUnit: 0.002 }],
      orders: [],
      recipes: [],
    });

    await service.saveRecipe({
      id: 'cookie-1',
      name: 'Galleta de prueba',
      category: 'Clásicas',
      yield: 12,
      price: 1,
      sections: [{ name: 'masa', ingredients: [{ ingredientId: 'flour', quantity: 125 }] }],
    } as never);

    expect(repository.upsertRecipeAndCatalogProjection).toHaveBeenCalledWith(
      'cookie-1',
      expect.objectContaining({
        sections: [{ name: 'masa', ingredients: [{ ingredientId: 'flour', quantity: 125 }] }],
        items: [expect.objectContaining({ id: 'flour', ingredientId: 'flour', qty: 125, quantity: 125, section: 'masa' })],
      }),
      false,
    );
    expect(service.recipes()[0].sections[0].ingredients).toEqual([{ ingredientId: 'flour', quantity: 125 }]);
  });

  it('recovers recipe ingredients from flattened legacy items when section rows are empty', () => {
    const legacyState = {
      ingredients: [{ id: 'flour', name: 'Harina', unit: 'g', costPerUnit: 0.002 }],
      orders: [],
      recipes: [{
        id: 'legacy-cookie',
        name: 'Galleta anterior',
        category: 'Clásicas',
        yield: 12,
        price: 1,
        sections: [{ name: 'masa', ingredients: [] }],
        items: [{ id: 'flour', qty: 125, section: 'masa' }],
      }],
    };

    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels(legacyState);
    expect(service.recipes()[0].sections[0].ingredients).toEqual([{ ingredientId: 'flour', quantity: 125 }]);
  });

  it('hides a recipe through the catalog projection without copying catalog fields into recipes', async () => {
    await service.setRecipeCatalogVisibility('000015', false);

    expect(repository.upsertRecipeAndCatalogProjection).toHaveBeenCalledWith(
      '000015',
      expect.objectContaining({ id: '000015', catalogVisible: false }),
    );
    expect(service.rawState()?.['catalogDrafts']).toEqual([expect.objectContaining({ id: '000015', visible: false })]);
    expect(service.recipes()[0].catalogVisible).toBe(false);
  });

  it('shows a hidden recipe again without changing its other stored fields', async () => {
    service.rawState.update(state => ({
      ...state!,
      recipes: [{ ...((state!['recipes'] as Record<string, unknown>[])[0]), catalogVisible: false }],
      catalogDrafts: [{ id: '000015', visible: false, label: 'Favorita', description: '', image: '', labelColor: 'Morado' }],
    }));

    await service.setRecipeCatalogVisibility('000015', true);

    expect(repository.upsertRecipeAndCatalogProjection).toHaveBeenCalledWith(
      '000015',
      expect.objectContaining({ catalogVisible: true, catalogLabel: 'Favorita' }),
      undefined,
    );
    expect(service.rawState()?.['catalogDrafts']).toEqual([expect.objectContaining({ id: '000015', visible: true, label: 'Favorita' })]);
    expect(service.recipes()[0].catalogVisible).toBe(true);
  });
  it('updates catalog visibility immediately and rolls it back if the write fails', async () => {
    let rejectWrite!: (reason: Error) => void;
    repository.upsertRecipeAndCatalogProjection.mockReturnValueOnce(new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    }));

    const save = service.setRecipeCatalogVisibility('000015', false);
    expect(service.recipes()[0].catalogVisible).toBe(false);

    rejectWrite(new Error('Firebase unavailable'));
    await expect(save).rejects.toThrow('Firebase unavailable');
    expect(service.recipes()[0].catalogVisible).toBe(true);
  });

});
