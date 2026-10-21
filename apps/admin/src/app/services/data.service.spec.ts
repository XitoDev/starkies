import { TestBed } from '@angular/core/testing';
import { DataService } from './data.service';
import { FirestoreBusinessRepository } from '../core/firebase/firestore-business.repository';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

describe('DataService catalog visibility', () => {
  const repository = {
    loadState: vi.fn().mockResolvedValue(null),
    upsertCollectionRecord: vi.fn().mockResolvedValue(undefined),
  };
  let service: DataService;

  beforeEach(() => {
    repository.loadState.mockReset().mockResolvedValue(null);
    repository.upsertCollectionRecord.mockReset().mockResolvedValue(undefined);
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

  it('hides a recipe by updating only the stored record visibility flag', async () => {
    await service.setRecipeCatalogVisibility('000015', false);

    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'recipes',
      '000015',
      expect.objectContaining({ id: '000015', catalogVisible: false }),
    );
    const savedRecord = repository.upsertCollectionRecord.mock.calls[0][2] as Record<string, unknown>;
    expect(savedRecord).not.toHaveProperty('catalogLabel');
    expect(service.recipes()[0].catalogVisible).toBe(false);
  });

  it('shows a hidden recipe again without changing its other stored fields', async () => {
    service.rawState.update(state => ({
      ...state!,
      recipes: [{ ...((state!['recipes'] as Record<string, unknown>[])[0]), catalogVisible: false, catalogLabel: 'Favorita' }],
    }));

    await service.setRecipeCatalogVisibility('000015', true);

    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'recipes',
      '000015',
      expect.objectContaining({ catalogVisible: true, catalogLabel: 'Favorita' }),
    );
    expect(service.recipes()[0].catalogVisible).toBe(true);
  });
  it('updates catalog visibility immediately and rolls it back if the write fails', async () => {
    let rejectWrite!: (reason: Error) => void;
    repository.upsertCollectionRecord.mockReturnValueOnce(new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    }));

    const save = service.setRecipeCatalogVisibility('000015', false);
    expect(service.recipes()[0].catalogVisible).toBe(false);

    rejectWrite(new Error('Firebase unavailable'));
    await expect(save).rejects.toThrow('Firebase unavailable');
    expect(service.recipes()[0].catalogVisible).toBe(true);
  });

});
