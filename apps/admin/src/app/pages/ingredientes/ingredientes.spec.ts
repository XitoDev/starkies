import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DataService } from '../../services/data.service';
import { Ingredientes } from './ingredientes';

describe('Ingredientes', () => {
  let component: Ingredientes;
  let fixture: ComponentFixture<Ingredientes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ingredientes],
      providers: [
        { provide: DataService, useValue: { ingredients: signal([]), recipes: signal([]), loadCollections: vi.fn(async () => undefined) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Ingredientes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('offers countable units and converts a dozen to 12 base units', () => {
    expect(component).toBeTruthy();
    expect(component.packageUnits.some(unit => unit.value === 'unidad')).toBe(true);
    expect(component.packageUnits.some(unit => unit.value === 'docena')).toBe(true);
    component.updateNumberField('packageQuantityGrams', '1');
    component.updateUnit('docena');
    expect(component.form().unit).toBe('unidad');
    expect(component.normalizedPackageQuantity()).toBe(12);
  });
});
