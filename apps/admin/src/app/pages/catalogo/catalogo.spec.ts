import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Recipe } from 'shared';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { Catalogo } from './catalogo';

const makeRecipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'cookie-1',
  name: 'Brownie',
  category: 'Galletas clásicas',
  yield: 12,
  price: 2.5,
  image: 'recipe-photo.webp',
  catalogImage: 'catalog-photo.webp',
  catalogVisible: true,
  sections: [],
  ...overrides,
});

describe('Catalogo', () => {
  let component: Catalogo;
  let fixture: ComponentFixture<Catalogo>;
  let recipeState: ReturnType<typeof signal<Recipe[]>>;
  let dataServiceMock: {
    recipes: ReturnType<typeof signal<Recipe[]>>;
    rawState: ReturnType<typeof signal<Record<string, unknown> | null>>;
    loadCollections: ReturnType<typeof vi.fn>;
    setRecipeCatalogVisibility: ReturnType<typeof vi.fn>;
    deleteRecipe: ReturnType<typeof vi.fn>;
    loadFromCloud: ReturnType<typeof vi.fn>;
    saveBusinessSetting: ReturnType<typeof vi.fn>;
  };
  let recipeImageServiceMock: { getImageUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    recipeState = signal<Recipe[]>([]);
    dataServiceMock = {
      recipes: recipeState,
      rawState: signal<Record<string, unknown> | null>(null),
      loadCollections: vi.fn(async () => undefined),
      setRecipeCatalogVisibility: vi.fn(async () => undefined),
      deleteRecipe: vi.fn(async () => undefined),
      loadFromCloud: vi.fn(async () => undefined),
      saveBusinessSetting: vi.fn(async () => undefined),
    };
    recipeImageServiceMock = {
      getImageUrl: vi.fn((path?: string) => path ?? '/images/recipe-placeholder.svg'),
    };

    await TestBed.configureTestingModule({
      imports: [Catalogo],
      providers: [
        provideRouter([]),
        { provide: DataService, useValue: dataServiceMock },
        { provide: RecipeImageService, useValue: recipeImageServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Catalogo);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a table with catalog images and keeps hidden products manageable', () => {
    recipeState.set([
      makeRecipe(),
      makeRecipe({ id: 'cookie-2', name: 'Red velvet', catalogVisible: false, catalogImage: 'red-velvet-catalog.webp' }),
    ]);
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('table.catalog-table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(Array.from(table.querySelectorAll('thead th')).map(cell => cell.textContent?.trim()))
      .toEqual(['Imagen', 'Nombre', 'Categoría', 'Precio', 'Acciones']);
    expect(recipeImageServiceMock.getImageUrl).toHaveBeenCalledWith('catalog-photo.webp');
    expect(recipeImageServiceMock.getImageUrl).toHaveBeenCalledWith('red-velvet-catalog.webp');
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
    expect(table.textContent).toContain('Oculto del catálogo público');
  });

  it('persists the requested visibility change for the selected product', async () => {
    const item = makeRecipe();
    await component.toggleVisibility(item);
    expect(dataServiceMock.setRecipeCatalogVisibility).toHaveBeenCalledWith(item.id, false);
    expect(component.notice()).toContain('oculto');
  });

  it('requires confirmation before deleting and deletes only after confirmation', async () => {
    const item = makeRecipe();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    await component.deleteProduct(item);
    expect(dataServiceMock.deleteRecipe).not.toHaveBeenCalled();

    await component.deleteProduct(item);
    expect(dataServiceMock.deleteRecipe).toHaveBeenCalledWith(item.id);
    expect(component.notice()).toContain('se eliminó correctamente');
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
});
