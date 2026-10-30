import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sidebar } from './sidebar';
import { DataService } from '../../services/data.service';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;
  let ordersSignal: ReturnType<typeof signal<{ status: string }[]>>;

  beforeEach(async () => {
    ordersSignal = signal([{ status: 'PENDING' }]);
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter([]), { provide: DataService, useValue: { orders: ordersSignal } }],
    }).compileComponents();
    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('adds Estadísticas to the sidebar and moves Configuración out of the navigation', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/estadisticas"]')?.textContent).toContain('Estadísticas');
    expect(fixture.nativeElement.querySelector('a[href="/catalogo/promociones"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.settings-trigger')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sidebar-profile')).toBeNull();
    expect(fixture.nativeElement.querySelector('.business-mark')).toBeNull();
  });

  it('provides an accessible Material-styled shortcut to the public store', () => {
    const storeLink = fixture.nativeElement.querySelector('.business-card') as HTMLAnchorElement;
    expect(storeLink.getAttribute('href')).toBe('https://starkies.lat/');
    expect(storeLink.getAttribute('target')).toBe('_blank');
    expect(storeLink.getAttribute('rel')).toContain('noopener');
    expect(storeLink.getAttribute('aria-label')).toContain('Mi tienda');
    expect(storeLink.getAttribute('matButton')).toBe('filled');
    expect(storeLink.textContent).toContain('Mi tienda');
    expect(storeLink.textContent).not.toContain('Ver catálogo público');
    expect(storeLink.querySelector('mat-icon')?.textContent?.trim()).toBe('shopping_cart');
  });

  it('shows the pending order count and hides the badge when the count reaches zero', () => {
    let badge = fixture.nativeElement.querySelector('.nav-badge') as HTMLElement;
    expect(badge.textContent?.trim()).toBe('1');
    expect(badge.getAttribute('aria-label')).toBe('1 pedidos pendientes');
    ordersSignal.set([]);
    fixture.detectChanges();
    badge = fixture.nativeElement.querySelector('.nav-badge') as HTMLElement;
    expect(badge).toBeNull();
  });
});