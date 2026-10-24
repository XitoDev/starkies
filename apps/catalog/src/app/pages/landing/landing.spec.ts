import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { NgForm } from '@angular/forms';
import { Landing } from './landing';
import { provideRouter } from '@angular/router';

describe('Landing', () => {
  let schemaScript: HTMLScriptElement | null = null;
  let originalSchemaContent: string | null = null;
  let createdSchemaScript = false;

  beforeEach(async () => {
    schemaScript = null;
    originalSchemaContent = null;
    createdSchemaScript = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await TestBed.configureTestingModule({ imports: [Landing], providers: [provideRouter([])] }).compileComponents();
  });

  afterEach(() => {
    if (schemaScript) {
      if (createdSchemaScript) schemaScript.remove();
      else schemaScript.textContent = originalSchemaContent;
    }
    vi.unstubAllGlobals();
  });

  it('creates the landing page', () => {
    const fixture = TestBed.createComponent(Landing);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('adds published cookie images, delivery rates and refund policy to the box schema', async () => {
    const existingScript = document.getElementById('starkies-site-structured-data') as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');
    schemaScript = script;
    createdSchemaScript = !existingScript;
    if (existingScript) originalSchemaContent = existingScript.textContent;
    script.id = 'starkies-site-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Bakery', '@id': 'https://starkies.lat/#bakery' },
        {
          '@type': 'ItemList',
          itemListElement: [
            { '@type': 'ListItem', item: { '@type': 'Product', name: 'Caja solo clásicas', offers: {} } },
            { '@type': 'ListItem', item: { '@type': 'Product', name: 'Caja solo New York', offers: {} } },
            { '@type': 'ListItem', item: { '@type': 'Product', name: 'Caja mixta de galletas', offers: {} } },
          ],
        },
      ],
    });
    if (!existingScript) document.head.appendChild(script);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          { name: 'Brownie Classic', isNy: false, image: '/images/starkies-brownie-cookie.webp' },
          { name: 'Choco Meteor', isNy: true, image: 'https://cdn.example.test/choco-meteor.webp' },
        ],
        zones: [
          { name: 'Norte', fee: 3.5 },
          { name: 'Retiro en tienda', fee: 0 },
        ],
      }),
    }));

    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    await fixture.whenStable();

    const data = JSON.parse(script.textContent ?? '{}') as { '@graph': Array<Record<string, unknown>> };
    const bakery = data['@graph'].find(node => node['@type'] === 'Bakery');
    const itemList = data['@graph'].find(node => node['@type'] === 'ItemList');
    const elements = itemList?.['itemListElement'] as Array<{ item: Record<string, unknown> }>;
    expect(bakery?.['hasMerchantReturnPolicy']).toMatchObject({
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'EC',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    });
    expect(elements[0].item['image']).toEqual(['https://starkies.lat/images/starkies-brownie-cookie.webp']);
    expect(elements[1].item['image']).toEqual(['https://cdn.example.test/choco-meteor.webp']);
    expect(elements[2].item['image']).toHaveLength(2);
    expect((elements[0].item['offers'] as Record<string, unknown>)['shippingDetails']).toHaveLength(1);
    expect((elements[0].item['offers'] as Record<string, unknown>)['hasMerchantReturnPolicy']).toBeTruthy();
  });

  it('includes all quote fields in the WhatsApp message', () => {
    const fixture = TestBed.createComponent(Landing);
    const component = fixture.componentInstance;
    component.phone = '0991234567';
    component.name = 'Cliente de prueba';
    component.quantity = 24;
    component.cookieType = 'Mixtas';
    component.notes = 'Galletas para un cumpleaños';
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as WindowProxy);

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
