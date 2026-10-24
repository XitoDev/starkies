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
  });
});
