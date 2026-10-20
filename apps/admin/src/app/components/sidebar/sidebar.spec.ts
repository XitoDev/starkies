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

  it('renders the logout button in place of the private-access text and omits the green indicator', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.profile-logout')?.textContent).toContain('Cerrar sesión');
    expect(fixture.nativeElement.textContent).not.toContain('Acceso privado');
    expect(fixture.nativeElement.querySelector('.online-indicator')).toBeNull();
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
