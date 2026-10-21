import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Recetas } from './recetas';

describe('Recetas', () => {
  let component: Recetas;
  let fixture: ComponentFixture<Recetas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Recetas],
      providers: [provideRouter([])],
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
