import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { Topbar } from './topbar';

describe('Topbar', () => {
  let signOutSpy: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    signOutSpy = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [provideRouter([]), { provide: FirebaseClientService, useValue: { signOut: signOutSpy } }],
    }).compileComponents();
  });
  it('shows Configuración instead of the date', () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.breadcrumb')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.settings-button')?.textContent).toContain('Configuración');
    expect(fixture.nativeElement.querySelector('.today')).toBeNull();
    expect(fixture.nativeElement.querySelector('.logout-button')).toBeNull();
  });
  it('signs out of Firebase and navigates to login', async () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await fixture.componentInstance.logout();
    expect(signOutSpy).toHaveBeenCalledOnce();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
    expect(fixture.componentInstance.loggingOut()).toBe(false);
  });
  it('shows an error when Firebase sign-out fails', async () => {
    signOutSpy.mockRejectedValueOnce(new Error('network unavailable'));
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();
    await fixture.componentInstance.logout();
    expect(fixture.componentInstance.logoutMessage()).toContain('No se pudo cerrar la sesión');
    expect(fixture.componentInstance.loggingOut()).toBe(false);
  });
});