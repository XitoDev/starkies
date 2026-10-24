import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { PrivacyPolicy } from './privacy-policy';

describe('PrivacyPolicy', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyPolicy],
      providers: [provideRouter([]), Title, Meta],
    }).compileComponents();
  });

  it('renders the privacy policy and explains customer-data handling', () => {
    const fixture = TestBed.createComponent(PrivacyPolicy);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Política de Privacidad');
    expect(text).toContain('Firebase');
    expect(text).toContain('teléfono');
    expect(text).toContain('almacenamiento de sesión');
    expect(text).toContain('WhatsApp');
    expect(fixture.nativeElement.querySelector('#entregas-reembolsos')).toBeTruthy();
    expect(text).toContain('reembolso del valor total pagado');
    expect(text).toContain('Una vez que el pedido está en camino, no se puede cancelar');
    expect(text).toContain('no aceptamos cambios ni devoluciones');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://starkies.lat/privacy-policy');
  });
});
