import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Landing] }).compileComponents();
  });

  it('creates the landing page', () => {
    const fixture = TestBed.createComponent(Landing);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('includes all quote fields in the WhatsApp message', () => {
    const fixture = TestBed.createComponent(Landing);
    const component = fixture.componentInstance;
    component.phone = '0991234567';
    component.name = 'Cliente de prueba';
    component.quantity = 24;
    component.cookieType = 'Mixtas';
    component.notes = 'Galletas para un cumpleaños';
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);

    component.sendQuote({ valid: true } as NgForm);

    expect(open).toHaveBeenCalledOnce();
    const url = String(open.mock.calls[0][0]);
    expect(url).toContain('wa.me/593979075202');
    const message = decodeURIComponent(url.split('?text=')[1] ?? '');
    expect(message).toContain('0991234567');
    expect(message).toContain('Cliente de prueba');
    expect(message).toContain('24 galletas');
    expect(message).toContain('Mixtas');
    expect(message).toContain('Galletas para un cumpleaños');
    open.mockRestore();
  });

  it('does not open WhatsApp when required fields are missing', () => {
    const fixture = TestBed.createComponent(Landing);
    const component = fixture.componentInstance;
    const open = vi.spyOn(window, 'open');

    component.sendQuote({ valid: false } as NgForm);

    expect(open).not.toHaveBeenCalled();
    expect(component.formError).toContain('Revisa los campos');
    open.mockRestore();
  });
});
