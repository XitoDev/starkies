import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Recipe, RecipeSection, Ingredient } from 'shared';
import { RecipeImageService } from '../../services/recipe-image.service';
import { ImageCdnUploadService } from '../../services/image-cdn-upload.service';
import { MasasBaseList } from './masas-base-list';

type RecipeSort = 'nameAsc' | 'nameDesc' | 'yieldDesc' | 'priceDesc';
type RecipeKind = 'own' | 'base';
type IngredientRow = { ingredientId: string; quantity: number | null };
type RecipeForm = {
  name: string; category: string; gramsPerCookie: number | null; price: number;
  kind: RecipeKind; baseId: string; image: string; notes: string;
  dough: IngredientRow[]; additions: IngredientRow[]; filling: IngredientRow[]; decoration: IngredientRow[];
};
type BaseIngredient = { ingredientId?: string; id?: string; name?: string; quantity?: number; qty?: number; unit?: string };
type DoughBase = { id?: string; name?: string; weight?: number; notes?: string; items?: BaseIngredient[]; ingredients?: BaseIngredient[] };

@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, MasasBaseList, MatButtonModule, MatIconModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatMenuModule],
  templateUrl: './recetas.html',
  styleUrls: ['./recetas.css']
})
export class Recetas {
  private readonly dataService = inject(DataService);
  private readonly recipeImageService = inject(RecipeImageService);
  private readonly imageUpload = inject(ImageCdnUploadService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly recipes = this.dataService.recipes;
  readonly ingredients = this.dataService.ingredients;
  readonly view = signal<'recipes' | 'bases'>('recipes');
  readonly showArchived = signal(false);
  readonly searchTerm = signal('');
  readonly sortBy = signal<RecipeSort>('nameAsc');
  readonly selectedCategories = signal<string[]>([]);
  readonly editorOpen = signal(false);
  readonly routeRecipeId = signal<string | null>(null);
  readonly routeEditor = computed(() => this.routeRecipeId() !== null);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly openMenuId = signal<string | null>(null);
  readonly imagePreview = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly form = signal<RecipeForm>(this.emptyForm());

  constructor() {
    void this.dataService.loadCollections(['recipes', 'ingredients', 'doughBases']);
    this.route.queryParamMap.subscribe(params => {
      if (params.get('vista') === 'masas-base') this.view.set('bases');
    });
    this.route.paramMap.subscribe(params => {
      const id = params.get('recipeId');
      this.routeRecipeId.set(id);
      if (!id) this.editorOpen.set(false);
    });
    effect(() => {
      const id = this.routeRecipeId();
      if (!id) return;
      const recipe = this.recipes().find(item => item.id === id);
      if (recipe && this.editingId() !== id) this.openEditRecipe(recipe);
    });
  }

  readonly categories = computed(() => Array.from(new Set(this.recipes().map(recipe => recipe.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')));
  readonly activeCount = computed(() => this.recipes().filter(recipe => !recipe.archived).length);
  readonly archivedCount = computed(() => this.recipes().filter(recipe => recipe.archived).length);
  readonly doughBases = computed<DoughBase[]>(() => {
    const value = this.dataService.rawState()?.['doughBases'];
    return Array.isArray(value) ? value as DoughBase[] : [];
  });
  readonly filteredRecipes = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase('es');
    const selected = this.selectedCategories();
    return [...this.recipes().filter(recipe => {
      const archivedMatch = Boolean(recipe.archived) === this.showArchived();
      const category = recipe.category.trim();
      return archivedMatch && (selected.length === 0 || selected.includes(category))
        && (!query || recipe.name.toLocaleLowerCase('es').includes(query) || category.toLocaleLowerCase('es').includes(query));
    })].sort((a, b) => {
      switch (this.sortBy()) {
        case 'nameDesc': return b.name.localeCompare(a.name, 'es');
        case 'yieldDesc': return b.yield - a.yield;
        case 'priceDesc': return b.price - a.price;
        default: return a.name.localeCompare(b.name, 'es');
      }
    });
  });
  readonly groupedRecipes = computed(() => {
    const groups = new Map<string, Recipe[]>();
    for (const recipe of this.filteredRecipes()) {
      const category = recipe.category.trim() || 'Sin categoría';
      groups.set(category, [...(groups.get(category) ?? []), recipe]);
    }
    return Array.from(groups.entries()).map(([category, recipes]) => ({ category, recipes }));
  });
  readonly selectedBase = computed(() => this.doughBases().find(base => base.id === this.form().baseId));
  readonly selectedBaseIngredients = computed(() => {
    const base = this.selectedBase();
    const rows = base?.ingredients ?? base?.items ?? [];
    return rows.map(row => {
      const ingredientId = String(row.ingredientId ?? row.id ?? '');
      const ingredient = this.ingredients().find(item => item.id === ingredientId);
      return {
        ingredientId,
        name: ingredient?.name ?? row.name ?? 'Insumo',
        quantity: Number(row.quantity ?? row.qty ?? 0),
        unit: ingredient?.unit ?? row.unit ?? 'g',
        costPerUnit: ingredient?.costPerUnit ?? 0,
      };
    });
  });
  readonly batchYield = computed(() => {
    const form = this.form();
    const grams = form.gramsPerCookie ?? 0;
    if (grams <= 0) return this.editingRecipe()?.yield ?? 1;
    const batchMass = form.kind === 'base'
      ? Number(this.selectedBase()?.weight ?? 0)
      : this.rowMass(form.dough) + this.rowMass(form.additions) + this.rowMass(form.filling) + this.rowMass(form.decoration);
    return Math.max(1, Math.floor(batchMass / grams) || 1);
  });
  readonly unitCost = computed(() => {
    const form = this.form();
    const costForRows = (rows: IngredientRow[]) => rows.reduce((sum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      return sum + (ingredient ? Number(row.quantity ?? 0) * ingredient.costPerUnit : 0);
    }, 0);
    if (form.kind === 'base') {
      const base = this.selectedBase();
      const baseTotal = this.selectedBaseIngredients().reduce(
        (sum, row) => sum + row.quantity * row.costPerUnit,
        0,
      );
      const baseCostPerCookie = base && Number(base.weight) > 0
        ? baseTotal * Number(form.gramsPerCookie ?? 0) / Number(base.weight)
        : 0;
      return baseCostPerCookie + costForRows(form.additions) + costForRows(form.filling);
    }
    return (costForRows(form.dough) + costForRows(form.additions) + costForRows(form.filling) + costForRows(form.decoration)) / Math.max(1, this.batchYield());
  });
  readonly currentRecipeCost = (recipe: Recipe): number => {
    const costForRows = (rows: { ingredientId: string; quantity: number }[]) => rows.reduce((sum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      return sum + (ingredient ? ingredient.costPerUnit * row.quantity : 0);
    }, 0);
    if (recipe.baseId) {
      const base = this.doughBases().find(item => item.id === recipe.baseId);
      const baseRows = base?.ingredients ?? base?.items ?? [];
      const baseTotal = baseRows.reduce((sum, row) => {
        const id = String(row.ingredientId ?? row.id ?? '');
        const ingredient = this.ingredients().find(item => item.id === id || item.name === row.name);
        return sum + (ingredient ? ingredient.costPerUnit * Number(row.quantity ?? row.qty ?? 0) : 0);
      }, 0);
      const baseCostPerCookie = Number(base?.weight ?? 0) > 0
        ? baseTotal * Number(recipe.baseGramsPerCookie ?? 0) / Number(base?.weight)
        : 0;
      const additionsCost = recipe.sections.filter(section => section.name.toLocaleLowerCase('es') !== 'masa')
        .reduce((sum, section) => sum + costForRows(section.ingredients), 0);
      return baseCostPerCookie + additionsCost;
    }
    return recipe.sections.reduce((sum, section) => sum + costForRows(section.ingredients), 0) / Math.max(1, recipe.yield);
  };

  setView(view: 'recipes' | 'bases'): void { this.view.set(view); }
  setArchiveState(archived: boolean): void { this.showArchived.set(archived); this.selectedCategories.set([]); }
  setSort(value: string): void { if (value === 'nameDesc' || value === 'yieldDesc' || value === 'priceDesc' || value === 'nameAsc') this.sortBy.set(value); }
  isCategorySelected(category: string): boolean { return this.selectedCategories().length === 0 || this.selectedCategories().includes(category); }
  toggleCategory(category: string, checked: boolean): void {
    const all = this.categories(), current = this.selectedCategories();
    if (current.length === 0) { if (!checked) this.selectedCategories.set(all.filter(item => item !== category)); return; }
    const next = checked ? Array.from(new Set([...current, category])) : current.filter(item => item !== category);
    this.selectedCategories.set(next.length === all.length ? [] : next);
  }
  getImageUrl(imagePath: string | undefined): string { return this.recipeImageService.getImageUrl(imagePath); }
  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith('/images/recipe-placeholder.svg')) image.src = '/images/recipe-placeholder.svg';
  }
  editingRecipe(): Recipe | undefined { const id = this.editingId(); return id ? this.recipes().find(recipe => recipe.id === id) : undefined; }
  openNewRecipe(): void {
    this.editingId.set(null); this.form.set(this.emptyForm()); this.imagePreview.set(''); this.selectedFile.set(null);
    this.formError.set(''); this.notice.set(''); this.openMenuId.set(null); this.editorOpen.set(true);
  }
  openEditRecipe(recipe: Recipe): void {
    this.editingId.set(recipe.id);
    const section = (...names: string[]) => recipe.sections
      .filter(item => names.some(name => {
        const sectionName = item.name.trim().toLocaleLowerCase('es');
        const expected = name.trim().toLocaleLowerCase('es');
        return sectionName === expected
          || (expected === 'masa' && sectionName.includes('masa'))
          || (expected.includes('añad') && sectionName.includes('añad'))
          || (expected === 'relleno' && (sectionName.includes('relleno') || sectionName.includes('decoración') || sectionName.includes('decoracion')));
      }))
      .flatMap(item => item.ingredients.map(row => ({ ingredientId: row.ingredientId, quantity: row.quantity })));
    this.form.set({
      name: recipe.name, category: recipe.category, gramsPerCookie: recipe.baseGramsPerCookie ?? null,
      price: recipe.price, kind: recipe.baseId ? 'base' : 'own', baseId: recipe.baseId ?? '',
      image: recipe.image ?? '', notes: String((recipe as Recipe & { notes?: string }).notes ?? ''),
      dough: section('masa'), additions: section('añadidos', 'añadidos a la masa'),
      filling: section('relleno'), decoration: section('decoración'),
    });
    this.imagePreview.set(recipe.image ? this.getImageUrl(recipe.image) : '');
    this.selectedFile.set(null); this.formError.set(''); this.notice.set(''); this.openMenuId.set(null); this.editorOpen.set(true);
  }
  closeEditor(): void {
    // Closing the editor must remain responsive even if Firebase is still
    // completing a request; the save promise handles its own success/error.
    this.formError.set('');
    if (this.routeEditor()) { void this.router.navigate(['/recetas']); return; }
    this.editorOpen.set(false);
  }
  setFormText(field: 'name' | 'category' | 'baseId' | 'notes', value: string): void { this.form.update(form => ({ ...form, [field]: value })); }
  setFormNumber(field: 'gramsPerCookie' | 'price', value: string): void {
    const parsed = value.trim() === '' ? null : Number(value);
    this.form.update(form => ({ ...form, [field]: parsed === null ? null : Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }));
  }
  setRecipeKind(value: string): void { if (value === 'own' || value === 'base') this.form.update(form => ({ ...form, kind: value, baseId: value === 'base' ? (form.baseId || this.doughBases()[0]?.id || '') : '' })); }
  addIngredient(section: 'dough' | 'additions' | 'filling' | 'decoration'): void {
    this.form.update(form => ({ ...form, [section]: [...form[section], { ingredientId: '', quantity: null }] }));
  }
  removeIngredient(section: 'dough' | 'additions' | 'filling' | 'decoration', index: number): void {
    this.form.update(form => ({ ...form, [section]: form[section].filter((_, i) => i !== index) }));
  }
  updateIngredient(section: 'dough' | 'additions' | 'filling' | 'decoration', index: number, field: 'ingredientId' | 'quantity', value: string): void {
    this.form.update(form => ({ ...form, [section]: form[section].map((row, i) => i !== index ? row : {
      ...row, [field]: field === 'quantity' ? (value.trim() === '' ? null : Math.max(0, Number(value) || 0)) : value,
    }) }));
  }
  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      this.formError.set('Elige una imagen JPG, PNG o WebP de hasta 3 MB.'); input.value = ''; return;
    }
    this.selectedFile.set(file); this.imagePreview.set(URL.createObjectURL(file)); this.formError.set('');
  }
  removePhoto(): void { this.selectedFile.set(null); this.imagePreview.set(''); this.form.update(form => ({ ...form, image: '' })); }
  async uploadPhoto(recipeId: string): Promise<string> {
    const file = this.selectedFile();
    if (!file) return this.form().image;
    this.uploadingImage.set(true);
    try {
      return await this.imageUpload.upload(file, 'recipe', recipeId);
    } finally {
      this.uploadingImage.set(false);
    }
  }
  async saveRecipe(): Promise<void> {
    const form = this.form();
    const name = String(form.name ?? '').trim();
    const category = String(form.category ?? '').trim();
    if (!name || !category) {
      this.formError.set(!name && !category
        ? 'Ingresa el nombre del sabor y su categoría.'
        : !name ? 'Ingresa el nombre del sabor.' : 'Ingresa la categoría de la receta.');
      return;
    }
    if (form.kind === 'base' && !form.baseId) { this.formError.set('Selecciona la masa base que utilizará esta receta.'); return; }
    const sections: RecipeSection[] = [];
    const validateRows = (rows: IngredientRow[]): string | null => {
      for (const row of rows) {
        const hasIngredient = Boolean(row.ingredientId);
        const hasQuantity = row.quantity !== null && Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0;
        if (hasIngredient !== hasQuantity || (hasIngredient && !this.ingredients().some(item => item.id === row.ingredientId))) {
          return 'Cada insumo debe tener una selección válida y una cantidad mayor que cero. No se guardó la receta para evitar perder ingredientes.';
        }
      }
      return null;
    };
    for (const rows of [form.dough, form.additions, form.filling, form.decoration]) {
      const validationError = validateRows(rows);
      if (validationError) { this.formError.set(validationError); return; }
    }
    const makeRows = (rows: IngredientRow[]) => rows
      .filter(row => Boolean(row.ingredientId) && row.quantity !== null && Number(row.quantity) > 0)
      .map(row => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) }));
    const dough = makeRows(form.dough), additions = makeRows(form.additions), filling = makeRows(form.filling), decoration = makeRows(form.decoration);
    if (form.kind === 'own' && !dough.length) { this.formError.set('Agrega al menos un ingrediente a la masa.'); return; }
    if (form.kind === 'base' && !form.baseId) { this.formError.set('Selecciona una masa base.'); return; }
    if (dough.length) sections.push({ name: 'masa', ingredients: dough });
    if (additions.length) sections.push({ name: 'añadidos', ingredients: additions });
    if (filling.length) sections.push({ name: 'relleno', ingredients: filling });
    if (decoration.length) sections.push({ name: 'decoración', ingredients: decoration });
    if (sections.some(section => section.ingredients.some(row => !Number.isFinite(row.quantity) || row.quantity <= 0))) { this.formError.set('Revisa las cantidades de los ingredientes.'); return; }
    this.saving.set(true); this.formError.set('');
    try {
      const isNewRecipe = !this.editingId();
      const id = this.editingId() ?? crypto.randomUUID();
      const image = await this.uploadPhoto(id);
      const recipe: Recipe & { notes?: string } = {
        ...(this.editingRecipe() ?? {} as Recipe),
        id, name, category, yield: this.batchYield(), price: Math.max(0, Number(form.price ?? 0)),
        image: image || undefined, ...(isNewRecipe ? { catalogLabel: 'Nuevo' } : {}),
        archived: this.editingRecipe()?.archived ?? false,
        baseId: form.kind === 'base' ? form.baseId : undefined,
        baseGramsPerCookie: form.gramsPerCookie ?? undefined, sections, notes: form.notes.trim() || undefined,
      };
      await Promise.race([
        this.dataService.saveRecipe(recipe),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
          'Firestore no respondió después de 25 segundos. Comprueba si la receta se guardó antes de volver a intentarlo. Las fotografías nuevas se publican mediante el CDN, no mediante Firebase Storage.'
        )), 25000)),
      ]);
      this.editorOpen.set(false); this.notice.set(this.editingId() ? 'Receta actualizada correctamente.' : 'Receta creada correctamente.');
      this.editingId.set(null); this.selectedFile.set(null);
      if (this.routeEditor()) { await this.router.navigate(['/catalogo']); }
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'No se pudo guardar la receta.'); }
    finally { this.saving.set(false); }
  }
  async deleteRecipe(recipe: Recipe): Promise<void> {
    this.openMenuId.set(null);
    const confirmed = window.confirm(`¿Eliminar el producto \"${recipe.name}\"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    this.notice.set('');
    try {
      await this.dataService.deleteRecipe(recipe.id);
      this.notice.set('Producto eliminado correctamente.');
      if (this.editingId() === recipe.id) this.closeEditor();
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : 'No se pudo eliminar el producto.');
    }
  }

  async archiveRecipe(recipe: Recipe): Promise<void> {
    this.openMenuId.set(null);
    const archived = !recipe.archived;
    try {
      await this.dataService.saveRecipe({ ...recipe, archived, archivedAt: archived ? new Date().toISOString() : undefined });
      this.notice.set(archived ? 'Receta archivada.' : 'Receta restaurada.');
    } catch (error) { this.notice.set(error instanceof Error ? error.message : 'No se pudo actualizar la receta.'); }
  }
  duplicateRecipe(recipe: Recipe): void {
    this.openMenuId.set(null); this.editingId.set(null);
    this.form.set({
      name: recipe.name + ' (copia)', category: recipe.category, gramsPerCookie: recipe.baseGramsPerCookie ?? null,
      price: recipe.price, kind: recipe.baseId ? 'base' : 'own', baseId: recipe.baseId ?? '',
      image: recipe.image ?? '', notes: String((recipe as Recipe & { notes?: string }).notes ?? ''),
      dough: recipe.sections.find(item => item.name === 'masa')?.ingredients.map(item => ({ ...item })) ?? [],
      additions: recipe.sections.filter(item => item.name.toLocaleLowerCase('es').includes('añad')).flatMap(item => item.ingredients.map(row => ({ ...row }))),
      filling: recipe.sections.filter(item => item.name.toLocaleLowerCase('es') === 'relleno').flatMap(item => item.ingredients.map(row => ({ ...row }))),
      decoration: recipe.sections.filter(item => ['decoración', 'decoracion'].includes(item.name.toLocaleLowerCase('es'))).flatMap(item => item.ingredients.map(row => ({ ...row }))),
    });
    this.imagePreview.set(recipe.image ? this.getImageUrl(recipe.image) : ''); this.selectedFile.set(null);
    this.formError.set(''); this.editorOpen.set(true);
  }
  private rowMass(rows: IngredientRow[]): number {
    return rows.reduce((sum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      const unit = ingredient?.unit.toLocaleLowerCase('es');
      return sum + (unit === 'kg' ? Number(row.quantity ?? 0) * 1000 : unit === 'g' || unit === 'ml' ? Number(row.quantity ?? 0) : 0);
    }, 0);
  }
  private emptyForm(): RecipeForm {
    return { name: '', category: '', gramsPerCookie: null, price: 0.6, kind: 'own', baseId: '', image: '', notes: '', dough: [{ ingredientId: '', quantity: null }], additions: [], filling: [], decoration: [] };
  }
}