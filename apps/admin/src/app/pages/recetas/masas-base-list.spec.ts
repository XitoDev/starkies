import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DataService } from '../../services/data.service';
import { DoughBaseService, DoughBaseRecord } from '../../services/dough-base.service';
import { MasasBaseList } from './masas-base-list';

describe('MasasBaseList', () => {
  let fixture: ComponentFixture<MasasBaseList>;
  let component: MasasBaseList;
  const base: DoughBaseRecord = {
    id: 'base-brownie',
    name: 'Masa base brownie',
    weight: 990,
    ingredients: [{ ingredientId: 'flour', quantity: 250 }],
    sortOrder: 0,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasasBaseList],
      providers: [
        provideRouter([]),
        { provide: DataService, useValue: { ingredients: signal([]), recipes: signal([]) } },
        { provide: DoughBaseService, useValue: { list: () => [base], move: vi.fn(), delete: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MasasBaseList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('calculates portions and leftover mass for the 30 g and 60 g sizes', () => {
    expect(component.yieldFor(base, 30)).toEqual({ count: 33, remainder: 0 });
    expect(component.yieldFor(base, 60)).toEqual({ count: 16, remainder: 30 });
  });

  it('renders the base name, batch weight, and both yield sizes', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Masa base brownie');
    expect(text).toContain('990 g');
    expect(text).toContain('Porciones de 30 g');
    expect(text).toContain('Porciones de 60 g');
    expect(text).toContain('Sobran 30 g');
  });
});
