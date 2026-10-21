import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { DataService } from '../../services/data.service';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;
  let signOutSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    signOutSpy = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([]),
        { provide: FirebaseClientService, useValue: { signOut: signOutSpy } },
        { provide: DataService, useValue: { exportBackup: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('offers backup and logout inside the settings menu and omits the old profile section', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.settings-trigger')?.textContent).toContain('Configuración');
    expect(fixture.nativeElement.querySelector('.sidebar-profile')).toBeNull();
    expect(fixture.nativeElement.querySelector('.business-mark')).toBeNull();
    expect(fixture.nativeElement.querySelector('.business-external')).not.toBeNull();
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

  it('signs out of Firebase and navigates to login', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await component.logout();

    expect(signOutSpy).toHaveBeenCalledOnce();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
    expect(component.loggingOut()).toBe(false);
  });

  it('shows an error when Firebase sign-out fails', async () => {
    signOutSpy.mockRejectedValueOnce(new Error('network unavailable'));

    await component.logout();

    expect(component.logoutMessage()).toContain('No se pudo cerrar la sesión');
    expect(component.loggingOut()).toBe(false);
  });
});
