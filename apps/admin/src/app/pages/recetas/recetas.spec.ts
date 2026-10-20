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

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
