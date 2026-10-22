import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { ImageCdnUploadService } from '../../services/image-cdn-upload.service';
import { provideRouter } from '@angular/router';
import { Recetas } from './recetas';

describe('Recetas', () => {
  let component: Recetas;
  let fixture: ComponentFixture<Recetas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Recetas],
      providers: [
        provideRouter([]),
        { provide: DataService, useValue: { recipes: signal([]), ingredients: signal([]), rawState: signal(null), loadCollections: vi.fn(async () => undefined) } },
        { provide: RecipeImageService, useValue: {} },
        { provide: ImageCdnUploadService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Recetas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('keeps new category text in the recipe form state', () => {
    component.setFormText('name', 'Galleta de limón');
    component.setFormText('category', 'Galletas cítricas');
    expect(component.form().name).toBe('Galleta de limón');
    expect(component.form().category).toBe('Galletas cítricas');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
