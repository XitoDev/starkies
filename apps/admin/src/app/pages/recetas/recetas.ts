import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { LucideDynamicIcon, LucideChartPie, LucideDollarSign } from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { Recipe, RecipeSection, Ingredient } from 'shared';
import { RecipeImageService } from '../../services/recipe-image.service';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';

type RecipeSort = 'nameAsc' | 'nameDesc' | 'yieldDesc' | 'priceDesc';
type RecipeKind = 'own' | 'base';
type IngredientRow = { ingredientId: string; quantity: number | null };
type RecipeForm = {
  name: string; category: string; gramsPerCookie: number | null; price: number;
  kind: RecipeKind; baseId: string; image: string; notes: string;
  dough: IngredientRow[]; additions: IngredientRow[]; filling: IngredientRow[];
};
type BaseIngredient = { ingredientId?: string; id?: string; name?: string; quantity?: number; qty?: number; unit?: string };
type DoughBase = { id?: string; name?: string; weight?: number; notes?: string; items?: BaseIngredient[]; ingredients?: BaseIngredient[] };

@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, LucideDynamicIcon],
  templateUrl: './recetas.html',
  styleUrls: ['./recetas.css']
})
export class Recetas {
  private readonly dataService = inject(DataService);
  private readonly recipeImageService = inject(RecipeImageService);
  private readonly firebase = inject(FirebaseClientService);

  readonly icons = { PieChart: LucideChartPie, DollarSign: LucideDollarSign };
  readonly recipes = this.dataService.recipes;
  readonly ingredients = this.dataService.ingredients;
  readonly view = signal<'recipes' | 'bases'>('recipes');
  readonly showArchived = signal(false);
  readonly searchTerm = signal('');
  readonly sortBy = signal<RecipeSort>('nameAsc');
  readonly selectedCategories = signal<string[]>([]);
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly openMenuId = signal<string | null>(null);
  readonly imagePreview = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly form = signal<RecipeForm>(this.emptyForm());

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
      const id = String(row.ingredientId ?? row.id ?? '');
      const ingredient = this.ingredients().find(item => item.id === id);
      return { name: ingredient?.name ?? row.name ?? 'Insumo', quantity: Number(row.quantity ?? row.qty ?? 0), unit: ingredient?.unit ?? row.unit ?? 'g' };
    });
  });
  readonly batchYield = computed(() => {
    const form = this.form();
    const grams = form.gramsPerCookie ?? 0;
    if (grams <= 0) return this.editingRecipe()?.yield ?? 1;
    const baseWeight = form.kind === 'base' ? Number(this.selectedBase()?.weight ?? 0) : this.rowMass(form.dough);
    const addedWeight = this.rowMass(form.additions) + this.rowMass(form.filling);
    const result = Math.floor((baseWeight + addedWeight) / grams);
    return Math.max(1, result || 1);
  });
  readonly unitCost = computed(() => {
    const form = this.form();
    const rows = [...form.dough, ...form.additions, ...form.filling];
    let total = rows.reduce((sum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      return sum + (ingredient ? Number(row.quantity ?? 0) * ingredient.costPerUnit : 0);
    }, 0);
    if (form.kind === 'base') {
      total += this.selectedBaseIngredients().reduce((sum, row) => {
        const ingredient = this.ingredients().find(item => item.name === row.name);
        return sum + (ingredient ? row.quantity * ingredient.costPerUnit : 0);
      }, 0);
    }
    return total / Math.max(1, this.batchYield());
  });
  readonly currentRecipeCost = (recipe: Recipe): number => {
    const yieldCount = Math.max(1, recipe.yield);
    const total = recipe.sections.reduce((sum, section) => sum + section.ingredients.reduce((sectionSum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      return sectionSum + (ingredient ? ingredient.costPerUnit * row.quantity : 0);
    }, 0), 0);
    return total / yieldCount;
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
    const section = (name: string) => recipe.sections.find(item => item.name === name)?.ingredients.map(item => ({ ingredientId: item.ingredientId, quantity: item.quantity })) ?? [];
    this.form.set({
      name: recipe.name, category: recipe.category, gramsPerCookie: recipe.baseGramsPerCookie ?? null,
      price: recipe.price, kind: recipe.baseId ? 'base' : 'own', baseId: recipe.baseId ?? '',
      image: recipe.image ?? '', notes: String((recipe as Recipe & { notes?: string }).notes ?? ''),
      dough: section('masa'), additions: section('añadidos') .concat(section('Añadidos a la masa')),
      filling: section('relleno').concat(section('decoración')),
    });
    this.imagePreview.set(recipe.image ? this.getImageUrl(recipe.image) : '');
    this.selectedFile.set(null); this.formError.set(''); this.notice.set(''); this.openMenuId.set(null); this.editorOpen.set(true);
  }
  closeEditor(): void { if (this.saving()) return; this.editorOpen.set(false); this.formError.set(''); }
  setFormText(field: 'name' | 'category' | 'baseId' | 'notes', value: string): void { this.form.update(form => ({ ...form, [field]: value })); }
  setFormNumber(field: 'gramsPerCookie' | 'price', value: string): void {
    const parsed = value.trim() === '' ? null : Number(value);
    this.form.update(form => ({ ...form, [field]: parsed === null ? null : Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }));
  }
  setRecipeKind(value: string): void { if (value === 'own' || value === 'base') this.form.update(form => ({ ...form, kind: value, baseId: value === 'base' ? (form.baseId || this.doughBases()[0]?.id || '') : '' })); }
  addIngredient(section: 'dough' | 'additions' | 'filling'): void {
    this.form.update(form => ({ ...form, [section]: [...form[section], { ingredientId: '', quantity: null }] }));
  }
  removeIngredient(section: 'dough' | 'additions' | 'filling', index: number): void {
    this.form.update(form => ({ ...form, [section]: form[section].filter((_, i) => i !== index) }));
  }
  updateIngredient(section: 'dough' | 'additions' | 'filling', index: number, field: 'ingredientId' | 'quantity', value: string): void {
    this.form.update(form => ({ ...form, [section]: form[section].map((row, i) => i !== index ? row : {
      ...row, [field]: field === 'quantity' ? (value.trim() === '' ? null : Math.max(0, Number(value) || 0)) : value,
    }) }));
  }
  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.formError.set('Elige una imagen JPG, PNG o WebP de hasta 5 MB.'); input.value = ''; return;
    }
    this.selectedFile.set(file); this.imagePreview.set(URL.createObjectURL(file)); this.formError.set('');
  }
  removePhoto(): void { this.selectedFile.set(null); this.imagePreview.set(''); this.form.update(form => ({ ...form, image: '' })); }
  async uploadPhoto(recipeId: string): Promise<string> {
    const file = this.selectedFile();
    if (!file) return this.form().image;
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    this.uploadingImage.set(true);
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const storageRef = ref(getStorage(this.firebase.app), 'recipe-images/' + recipeId + '/' + crypto.randomUUID() + '.' + extension);
      const result = await uploadBytes(storageRef, file, { contentType: file.type });
      return await getDownloadURL(result.ref);
    } finally { this.uploadingImage.set(false); }
  }
  async saveRecipe(): Promise<void> {
    const form = this.form(), name = form.name.trim(), category = form.category.trim();
    if (!name || !category) { this.formError.set('Ingresa el nombre del sabor y su categoría.'); return; }
    if (form.kind === 'base' && !form.baseId) { this.formError.set('Selecciona la masa base que utilizará esta receta.'); return; }
    const sections: RecipeSection[] = [];
    const makeRows = (rows: IngredientRow[]) => rows.filter(row => row.ingredientId && Number(row.quantity) > 0).map(row => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) }));
    const dough = makeRows(form.dough), additions = makeRows(form.additions), filling = makeRows(form.filling);
    if (form.kind === 'own' && !dough.length) { this.formError.set('Agrega al menos un ingrediente a la masa.'); return; }
    if (form.kind === 'base' && !form.baseId) { this.formError.set('Selecciona una masa base.'); return; }
    if (dough.length) sections.push({ name: 'masa', ingredients: dough });
    if (additions.length) sections.push({ name: 'añadidos', ingredients: additions });
    if (filling.length) sections.push({ name: 'relleno', ingredients: filling });
    if (sections.some(section => section.ingredients.some(row => !Number.isFinite(row.quantity) || row.quantity <= 0))) { this.formError.set('Revisa las cantidades de los ingredientes.'); return; }
    this.saving.set(true); this.formError.set('');
    try {
      const id = this.editingId() ?? crypto.randomUUID();
      const image = await this.uploadPhoto(id);
      const recipe: Recipe & { notes?: string } = {
        ...(this.editingRecipe() ?? {} as Recipe),
        id, name, category, yield: this.batchYield(), price: Math.max(0, Number(form.price ?? 0)),
        image: image || undefined, archived: this.editingRecipe()?.archived ?? false,
        baseId: form.kind === 'base' ? form.baseId : undefined,
        baseGramsPerCookie: form.gramsPerCookie ?? undefined, sections, notes: form.notes.trim() || undefined,
      };
      await this.dataService.saveRecipe(recipe);
      this.editorOpen.set(false); this.notice.set(this.editingId() ? 'Receta actualizada correctamente.' : 'Receta creada correctamente.');
      this.editingId.set(null); this.selectedFile.set(null);
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'No se pudo guardar la receta.'); }
    finally { this.saving.set(false); }
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
      filling: recipe.sections.filter(item => ['relleno', 'decoración'].includes(item.name.toLocaleLowerCase('es'))).flatMap(item => item.ingredients.map(row => ({ ...row }))),
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
    return { name: '', category: '', gramsPerCookie: null, price: 0.6, kind: 'own', baseId: '', image: '', notes: '', dough: [{ ingredientId: '', quantity: null }], additions: [], filling: [] };
  }
}