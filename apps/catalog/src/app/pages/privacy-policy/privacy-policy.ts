import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './privacy-policy.css',
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {
  constructor() {
    inject(Title).setTitle('StarKies · Política de privacidad');
    inject(Meta).updateTag({
      name: 'description',
      content: 'Conoce cómo StarKies utiliza y protege la información que compartes al realizar pedidos y solicitar cotizaciones.',
    });
  }
}
