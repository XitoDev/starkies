import { Injectable, inject } from '@angular/core';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

export type CdnImageKind = 'product' | 'promotion';
interface CdnUploadResponse { imageUrl?: string; message?: string; sha256?: string; reused?: boolean; }
interface ImageReferenceResponse { message?: string; cleanupPending?: boolean; }
interface R2ConnectionCheckResponse { success?: boolean; write?: boolean; read?: boolean; delete?: boolean; message?: string; }
interface LegacyImageResponse { contentType?: string; imageBase64?: string; message?: string; }

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_WEBP_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 2200;

@Injectable({ providedIn: 'root' })
export class ImageCdnUploadService {
  private readonly firebase = inject(FirebaseClientService);

  async upload(file: File, kind: CdnImageKind, recordId: string): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Elige una imagen JPG, PNG o WebP.');
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new Error('La imagen original debe pesar 12 MB o menos.');
    }
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(recordId)) throw new Error('El identificador del registro no es válido.');
    const webp = await this.toWebp(file);
    const imageBase64 = await this.toBase64(webp);
    const idToken = await this.requireIdToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/image-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ kind, recordId, contentType: 'image/webp', imageBase64 }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as CdnUploadResponse;
      if (!response.ok) throw new Error(result.message || 'No se pudo publicar la imagen en Cloudflare R2.');
      if (!result.imageUrl || !this.isManagedUrl(result.imageUrl)) {
        throw new Error('El servidor no devolvió una URL WebP válida de Cloudflare R2.');
      }
      return result.imageUrl;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('La publicación de la imagen tardó demasiado. No se modificó la referencia del producto; inténtalo nuevamente.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }


  async fetchLegacyImage(sourceUrl: string): Promise<Blob> {
    const idToken = await this.requireIdToken();
    const response = await fetch('/api/image-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ action: 'fetch-legacy-source', sourceUrl }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json().catch(() => ({})) as LegacyImageResponse;
    if (!response.ok) throw new Error(result.message || 'No se pudo recuperar la imagen del catálogo anterior.');
    if (!result.imageBase64 || !['image/jpeg', 'image/png', 'image/webp'].includes(result.contentType ?? '')) {
      throw new Error('El servidor anterior no devolvió una imagen JPG, PNG o WebP válida.');
    }
    const binary = atob(result.imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: result.contentType });
  }

  async checkConnection(): Promise<void> {
    const idToken = await this.requireIdToken();
    const response = await fetch('/api/image-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ action: 'connection-check' }),
    });
    const result = await response.json().catch(() => ({})) as R2ConnectionCheckResponse;
    if (!response.ok || !result.success) throw new Error(result.message || 'No se pudo verificar la conexión con Cloudflare R2.');
  }

  async syncReference(kind: CdnImageKind, recordId: string, oldImageUrl: string, newImageUrl: string): Promise<void> {
    const idToken = await this.requireIdToken();
    const response = await fetch('/api/image-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ kind, recordId, oldImageUrl, newImageUrl }),
    });
    const result = await response.json().catch(() => ({})) as ImageReferenceResponse;
    if (!response.ok) throw new Error(result.message || 'No se pudieron actualizar las referencias de la imagen.');
    if (result.cleanupPending) {
      console.warn('La referencia se actualizó; la eliminación de la imagen anterior quedó pendiente de la limpieza automática.');
    }
  }

  isManagedUrl(value: string | undefined): boolean {
    return typeof value === 'string' && /\/images\/[a-f0-9]{64}\.webp(?:[?#].*)?$/i.test(value);
  }

  private async requireIdToken(): Promise<string> {
    const user = this.firebase.auth.currentUser;
    if (!user) throw new Error('Tu sesión expiró. Inicia sesión nuevamente antes de administrar imágenes.');
    return user.getIdToken();
  }

  private async toWebp(file: File): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('No se pudo decodificar la imagen. Comprueba que el archivo no esté dañado.');
    }
    try {
      let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      let width = Math.max(1, Math.round(bitmap.width * scale));
      let height = Math.max(1, Math.round(bitmap.height * scale));
      let quality = 0.84;
      let blob = await this.renderWebp(bitmap, width, height, quality);
      while (blob.size > MAX_WEBP_BYTES && quality > 0.64) {
        quality = Math.max(0.64, quality - 0.08);
        blob = await this.renderWebp(bitmap, width, height, quality);
      }
      while (blob.size > MAX_WEBP_BYTES && Math.max(width, height) > 900) {
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
        blob = await this.renderWebp(bitmap, width, height, 0.72);
      }
      if (blob.type !== 'image/webp') throw new Error('Este navegador no pudo convertir la imagen a WebP.');
      if (blob.size > MAX_WEBP_BYTES) throw new Error('La imagen sigue superando 3 MB después de convertirla a WebP. Reduce sus dimensiones e inténtalo nuevamente.');
      return blob;
    } finally {
      bitmap.close();
    }
  }

  private renderWebp(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return Promise.reject(new Error('No se pudo preparar la imagen para convertirla a WebP.'));
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('No se pudo convertir la imagen a WebP.'));
      }, 'image/webp', quality);
    });
  }

  private toBase64(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen convertida.'));
      reader.onload = () => {
        const value = String(reader.result ?? '');
        const comma = value.indexOf(',');
        if (comma < 0) reject(new Error('La imagen convertida no tiene un formato válido.'));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }
}
