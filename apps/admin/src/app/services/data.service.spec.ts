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

  it('recovers legacy filling rows when the section labels differ', () => {
    const legacyState = {
      ingredients: [{ id: 'chocolate', name: 'Chocolate', unit: 'g', costPerUnit: 0.01 }],
      orders: [],
      recipes: [{
        id: 'legacy-filling-cookie',
        name: 'Galleta rellena',
        category: 'Clásicas',
        yield: 12,
        price: 1,
        sections: [{ name: 'Relleno · por galleta', ingredients: [] }],
        items: [{ id: 'chocolate', qty: 5, section: 'relleno' }],
      }],
    };

    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels(legacyState);
    expect(service.recipes()[0].sections[0].ingredients).toEqual([
      { ingredientId: 'chocolate', quantity: 5 },
    ]);
  });

  it('normalizes accents when recovering legacy decoration rows', () => {
    const legacyState = {
      ingredients: [{ id: 'sugar', name: 'Azúcar', unit: 'g', costPerUnit: 0.002 }],
      orders: [],
      recipes: [{
        id: 'legacy-decorated-cookie',
        name: 'Galleta decorada',
        category: 'Clásicas',
        yield: 12,
        price: 1,
        sections: [{ name: 'Decoración · por galleta', ingredients: [] }],
        items: [{ id: 'sugar', qty: 3, section: 'decoracion' }],
      }],
    };

    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels(legacyState);
    expect(service.recipes()[0].sections[0].ingredients).toEqual([
      { ingredientId: 'sugar', quantity: 3 },
    ]);
  });

  it('merges legacy items into partial recipe sections and restores missing sections', () => {
    const legacyState = {
      ingredients: [
        { id: 'flour', name: 'Harina', unit: 'g', costPerUnit: 0.002 },
        { id: 'chocolate', name: 'Chocolate', unit: 'g', costPerUnit: 0.01 },
        { id: 'sugar', name: 'Azúcar', unit: 'g', costPerUnit: 0.002 },
      ],
      orders: [],
      recipes: [{
        id: 'partial-legacy-cookie',
        name: 'Galleta antigua',
        category: 'Clásicas',
        yield: 12,
        price: 1,
        sections: [
          { name: 'Masa', ingredients: [{ ingredientId: 'flour', quantity: 100 }] },
          { name: 'Relleno · por galleta', ingredients: [] },
        ],
        items: [
          { id: 'flour', qty: 100, section: 'masa' },
          { id: 'chocolate', qty: 5, section: 'relleno' },
          { id: 'sugar', qty: 3, section: 'decoracion' },
        ],
      }],
    };
    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels(legacyState);
    const sections = service.recipes()[0].sections;
    expect(sections.find(section => section.name === 'masa')?.ingredients).toEqual([
      { ingredientId: 'flour', quantity: 100 },
    ]);
    expect(sections.find(section => section.name === 'relleno')?.ingredients).toEqual([
      { ingredientId: 'chocolate', quantity: 5 },
    ]);
    expect(sections.find(section => section.name === 'decoración')?.ingredients).toEqual([
      { ingredientId: 'sugar', quantity: 3 },
    ]);
  });

  it('keeps a selected legacy filling ingredient after save and reopen', async () => {
    const ingredients = [{ id: 'chocolate', name: 'Chocolate', unit: 'g', costPerUnit: 0.01 }];
    const legacyState = {
      ingredients,
      orders: [],
      recipes: [{
        id: 'legacy-roundtrip-cookie',
        name: 'Galleta rellena',
        category: 'Clásicas',
        yield: 12,
        price: 1,
        sections: [{ name: 'Relleno · por galleta', ingredients: [] }],
        items: [{ id: 'chocolate', qty: 5, section: 'relleno' }],
      }],
    };

    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels(legacyState);
    const recipeBeforeSave = service.recipes()[0];
    expect(recipeBeforeSave.sections.find(section => section.name === 'relleno')?.ingredients).toEqual([
      { ingredientId: 'chocolate', quantity: 5 },
    ]);

    await service.saveRecipe(recipeBeforeSave);

    const savedRecord = repository.upsertRecipeAndCatalogProjection.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(savedRecord['sections']).toEqual([
      { name: 'relleno', ingredients: [{ ingredientId: 'chocolate', quantity: 5 }] },
    ]);
    expect(savedRecord['items']).toEqual([
      expect.objectContaining({ id: 'chocolate', qty: 5, section: 'relleno' }),
    ]);

    (service as unknown as { loadViewModels: (state: Record<string, unknown>) => void }).loadViewModels({
      ingredients,
      orders: [],
      recipes: [savedRecord],
    });
    expect(service.recipes()[0].sections.find(section => section.name === 'relleno')?.ingredients).toEqual([
      { ingredientId: 'chocolate', quantity: 5 },
    ]);
  });

  it('hides a recipe through the catalog projection without copying catalog fields into recipes', async () => {
    await service.setRecipeCatalogVisibility('000015', false);

    expect(repository.upsertRecipeAndCatalogProjection).toHaveBeenCalledWith(
      '000015',
      expect.objectContaining({ id: '000015', catalogVisible: false }),
      true,
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
      true,
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


  it('recovers contact details from an unknown customer order', () => {
    service.rawState.set({
      ingredients: [],
      recipes: [],
      customers: [],
      orders: [{
        id: 'order-unknown',
        customerId: 'missing-customer',
        customer: 'Ana Pérez',
        phone: '0991234567',
        address: 'Centro — Calle 10 y 11',
        zone: 'Centro',
        total: 8,
        lines: [{ id: 'cookie-1', name: 'Brownie', qty: 2, price: 4 }],
      }],
    });

    expect(service.getCustomerDraftFromOrder('order-unknown')).toEqual({
      name: 'Ana Pérez',
      phone: '0991234567',
      address: 'Calle 10 y 11',
    });
  });

  it('creates a customer and links it to an unknown order without changing its existing total or items', async () => {
    service.rawState.set({
      ingredients: [],
      recipes: [],
      customers: [],
      orders: [{
        id: 'order-unknown',
        customerId: 'missing-customer',
        customer: 'Ana Pérez',
        phone: '0991234567',
        address: 'Centro — Calle 10 y 11',
        zone: 'Centro',
        total: 8,
        lines: [{ id: 'cookie-1', name: 'Brownie', qty: 2, price: 4 }],
      }],
    });

    const customer = await service.createCustomer({
      name: 'Ana Pérez',
      phone: '0991234567',
      address: 'Calle 10 y 11',
    }, 'order-unknown');

    expect(service.customers()).toEqual([expect.objectContaining({ id: customer.id, name: 'Ana Pérez' })]);
    expect(service.orders()[0].customerId).toBe(customer.id);
    expect(service.orders()[0].total).toBe(8);
    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'orders',
      'order-unknown',
      expect.objectContaining({ customerId: customer.id, total: 8 }),
    );
  });

  it('persists a customer by its document ID without requiring linked orders', async () => {
    service.rawState.set({
      ingredients: [],
      recipes: [],
      customers: [{ id: 'customer-1', name: 'Ana', phone: '0991234567', address: 'Centro' }],
      orders: [],
    });
    await service.saveCustomer({ id: 'customer-1', name: 'Ana María', phone: '0991234567', address: 'Centro' });
    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'customers',
      'customer-1',
      expect.objectContaining({ id: 'customer-1', name: 'Ana María' }),
    );
  });

  it('creates an admin order with linked customer, item lines and total including shipping', async () => {
    service.rawState.set({
      ingredients: [],
      recipes: [{ id: 'cookie-1', name: 'Brownie', price: 1.5 }],
      customers: [{ id: 'customer-1', name: 'Ana', phone: '0991234567', address: 'Centro' }],
      orders: [],
    });
    const created = await service.createOrder({
      customerId: 'customer-1',
      items: [{ recipeId: 'cookie-1', name: 'Brownie', quantity: 2, unitPrice: 1.5 }],
      shippingFee: 2,
      deliveryAddress: 'Centro',
    });
    expect(created.customerId).toBe('customer-1');
    expect(created.total).toBe(5);
    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'orders',
      expect.stringMatching(/^SK-\d{8}-[A-F0-9]{6}$/),
      expect.objectContaining({
        customerId: 'customer-1',
        total: 5,
        lines: [
          { id: 'cookie-1', name: 'Brownie', qty: 2, price: 1.5 },
        ],
        shippingFee: 2,
      }),
    );
    const savedOrder = repository.upsertCollectionRecord.mock.calls.find(([collectionKey]) => collectionKey === 'orders');
    expect(savedOrder?.[2]).not.toHaveProperty('deliveryAddress');
  });

  it('stores a changed delivery address on the order without overwriting the customer default', async () => {
    service.rawState.set({
      ingredients: [],
      recipes: [{ id: 'cookie-1', name: 'Brownie', price: 1.5 }],
      customers: [{ id: 'customer-1', name: 'Ana', phone: '0991234567', address: 'Centro' }],
      orders: [],
    });
    await service.createOrder({
      customerId: 'customer-1',
      items: [{ recipeId: 'cookie-1', name: 'Brownie', quantity: 1, unitPrice: 1.5 }],
      deliveryAddress: 'Norte',
    });
    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'orders',
      expect.stringMatching(/^SK-\d{8}-[A-F0-9]{6}$/),
      expect.objectContaining({ customerId: 'customer-1', deliveryAddress: 'Norte' }),
    );
    expect(repository.upsertCollectionRecord).not.toHaveBeenCalledWith(
      'customers',
      'customer-1',
      expect.objectContaining({ address: 'Norte' }),
    );
  });

  it('allows moving an order from a delivered state back to pending and persists the status', async () => {
    service.rawState.set({
      ingredients: [],
      recipes: [],
      customers: [{ id: 'customer-1', name: 'Ana', phone: '0991234567', address: 'Centro' }],
      orders: [{ id: 'order-1', customerId: 'customer-1', status: 'DELIVERED', total: 2, lines: [{ id: 'cookie-1', name: 'Brownie', qty: 2, price: 1 }] }],
    });
    await service.updateOrderStatus('order-1', 'PENDING');
    expect(repository.upsertCollectionRecord).toHaveBeenCalledWith(
      'orders',
      'order-1',
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

});
