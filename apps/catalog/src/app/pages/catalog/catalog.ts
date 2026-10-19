import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, BoxPresentation, PackedBox, DeliveryZone } from './catalog.models';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog.html',
  styleUrls: ['./catalog.css']
})
export class Catalog {
  // Configuración de presentaciones
  presentations: BoxPresentation[] = [
    { id: 'clasicas', name: 'Caja solo clásicas', desc: '10 clásicas', price: 6.00, reqClasicas: 10, reqNY: 0 },
    { id: 'ny', name: 'Caja solo New York', desc: '6 New York', price: 7.80, reqClasicas: 0, reqNY: 6 },
    { id: 'mixta', name: 'Caja mitad New York, mitad clásicas', desc: '4 clásicas + 4 New York', price: 7.60, reqClasicas: 4, reqNY: 4 }
  ];

  // Catálogo de productos
  products = signal<Product[]>([
    { id: '1', name: 'Brownie Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de cacao y textura craquelada.', tag: 'Más vendido', price: 0.60, isNy: false, stock: true },
    { id: '2', name: 'Avena Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g elaborada con avena y toque de vainilla.', price: 0.60, isNy: false, stock: true },
    { id: '3', name: 'Chispas de Chocolate Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y chispas.', price: 0.60, isNy: false, stock: true },
    { id: '4', name: 'Canela Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y toque de canela.', price: 0.60, isNy: false, stock: true },
    { id: '5', name: 'Red Velvet Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g red velvet con chocolate blanco.', tag: 'Agotado', price: 0.60, isNy: false, stock: false },
    { id: '6', name: 'Sunny Carrot', category: 'Galletas NY', description: 'Galleta de 60 g con zanahoria rallada y frosting de queso crema.', price: 1.30, isNy: true, stock: true },
    { id: '7', name: 'Chips Stars', category: 'Galletas NY', description: 'Galleta de 60 g con chispas y chocolate derretido.', tag: 'Nuevo', price: 1.30, isNy: true, stock: true },
    { id: '8', name: 'Velvet Kiss', category: 'Galletas NY', description: 'Galleta de 60 g red velvet decorada con chocolate blanco.', price: 1.30, isNy: true, stock: true },
    { id: '9', name: 'Cinna Moon', category: 'Galletas NY', description: 'Galleta de 60 g con canela y glaseado cremoso.', price: 1.30, isNy: true, stock: true },
    { id: '10', name: 'Nuti Dream', category: 'Galletas NY', description: 'Galleta de 60 g con masa de vainilla y Nutella.', price: 1.30, isNy: true, stock: true },
    { id: '11', name: 'Lemon Glow', category: 'Galletas NY', description: 'Galleta de 60 g sabor a limón con frosting blanco.', tag: 'Recomendado', price: 1.30, isNy: true, stock: true },
    { id: '12', name: 'Brownie Bliss', category: 'Galletas NY', description: 'Galleta de 60 g con masa de brownie y chocolate derretido.', tag: 'Más vendido', price: 1.30, isNy: true, stock: true },
    { id: '13', name: 'Choco Meteor', category: 'Galletas NY', description: 'Galleta de 60 g con masa de cacao y chispas.', tag: 'Nuevo', price: 1.30, isNy: true, stock: true }
  ]);

  zones: DeliveryZone[] = [
    { id: '1', name: 'Kennedy', fee: 0.99 },
    { id: '2', name: 'Norte', fee: 3.50 },
    { id: '3', name: 'Centro', fee: 3.99 },
    { id: '4', name: 'Sur', fee: 4.50 },
    { id: '5', name: 'Daule/Samborondón', fee: 5.99 },
    { id: '6', name: 'Retiro en tienda', fee: 0.00 }
  ];

  // Estado reactivo (Signals)
  selectedPresentation = signal<BoxPresentation>(this.presentations[0]);
  currentBoxItems = signal<{ [productId: string]: number }>({});
  completedBoxes = signal<PackedBox[]>([]);
  searchQuery = signal<string>('');

  // Modales
  showBoxChoiceModal = signal<boolean>(false);
  showOrderSheetModal = signal<boolean>(false);

  // Formulario
  orderForm = {
    name: '',
    phone: '',
    zone: null as DeliveryZone | null,
    address: '',
    date: new Date().toISOString().split('T')[0],
    cookieName: '',
    notes: ''
  };

  // Computados
  categories = computed(() => ['Galletas clásicas', 'Galletas NY']);

  filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.products();
    return this.products().filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  });

  currentClasicasCount = computed(() => {
    let count = 0;
    const items = this.currentBoxItems();
    for (const [id, qty] of Object.entries(items)) {
      const prod = this.products().find(p => p.id === id);
      if (prod && !prod.isNy) count += qty;
    }
    return count;
  });

  currentNYCount = computed(() => {
    let count = 0;
    const items = this.currentBoxItems();
    for (const [id, qty] of Object.entries(items)) {
      const prod = this.products().find(p => p.id === id);
      if (prod && prod.isNy) count += qty;
    }
    return count;
  });

  totalBoxRequired = computed(() => this.selectedPresentation().reqClasicas + this.selectedPresentation().reqNY);
  totalBoxCurrent = computed(() => this.currentClasicasCount() + this.currentNYCount());

  isBoxComplete = computed(() => {
    const pres = this.selectedPresentation();
    return this.currentClasicasCount() === pres.reqClasicas && this.currentNYCount() === pres.reqNY;
  });

  boxesTotalSum = computed(() => this.completedBoxes().reduce((acc, b) => acc + b.presentation.price, 0));
  shippingFee = computed(() => this.orderForm.zone ? this.orderForm.zone.fee : 0);
  grandTotal = computed(() => this.boxesTotalSum() + this.shippingFee());

  // Acciones
  selectPresentation(pres: BoxPresentation) {
    this.selectedPresentation.set(pres);
    this.currentBoxItems.set({});
  }

  getQuantity(productId: string): number {
    return this.currentBoxItems()[productId] || 0;
  }

  changeQuantity(productId: string, delta: number) {
    const prod = this.products().find(p => p.id === productId);
    if (!prod || !prod.stock) return;

    const pres = this.selectedPresentation();
    if (delta > 0) {
      if (!prod.isNy && this.currentClasicasCount() >= pres.reqClasicas) return;
      if (prod.isNy && this.currentNYCount() >= pres.reqNY) return;
    }

    const currentMap = { ...this.currentBoxItems() };
    const newQty = (currentMap[productId] || 0) + delta;

    if (newQty <= 0) {
      delete currentMap[productId];
    } else {
      currentMap[productId] = newQty;
    }

    this.currentBoxItems.set(currentMap);
  }

  finishBox() {
    if (!this.isBoxComplete()) return;

    this.completedBoxes.update(prev => [
      ...prev,
      { presentation: this.selectedPresentation(), items: { ...this.currentBoxItems() } }
    ]);

    this.currentBoxItems.set({});
    this.showBoxChoiceModal.set(true);
  }

  openOrderSheet() {
    this.showBoxChoiceModal.set(false);
    this.showOrderSheetModal.set(true);
  }

  getProductName(id: string): string {
    return this.products().find(p => p.id === id)?.name || '';
  }

  getObjectKeys(obj: Record<string, number>): string[] {
    return Object.keys(obj);
  }

  sendToWhatsApp() {
    const f = this.orderForm;
    let msg = `*¡Hola StarKies! Quisiera realizar un pedido:*\n\n`;
    msg += `👤 *Cliente:* ${f.name}\n`;
    msg += `📞 *Teléfono:* ${f.phone}\n`;
    msg += `📍 *Sector:* ${f.zone?.name || 'Por definir'}\n`;
    msg += `🏡 *Dirección:* ${f.address}\n`;
    msg += `📅 *Fecha:* ${f.date}\n`;
    msg += `🏷️ *Nombre en caja:* ${f.cookieName || f.name}\n`;
    if (f.notes) msg += `📝 *Notas:* ${f.notes}\n`;

    msg += `\n📦 *DETALLE DE CAJAS:*\n`;
    this.completedBoxes().forEach((box, i) => {
      msg += `\n*Caja ${i + 1} (${box.presentation.name}):*\n`;
      for (const [id, qty] of Object.entries(box.items)) {
        msg += `  • ${qty}x ${this.getProductName(id)}\n`;
      }
    });

    msg += `\n💰 *Total Cajas:* $${this.boxesTotalSum().toFixed(2)}`;
    msg += `\n🛵 *Envío:* $${this.shippingFee().toFixed(2)}`;
    msg += `\n💵 *Total a pagar:* $${this.grandTotal().toFixed(2)}`;

    window.open(`https://wa.me/593985313438?text=${encodeURIComponent(msg)}`, '_blank');
  }
}
