import { Injectable, inject } from '@angular/core';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

export type CdnImageKind = 'recipe' | 'catalog';
interface CdnUploadResponse { imageUrl?: string; message?: string; }

@Injectable({ providedIn: 'root' })
export class ImageCdnUploadService {
  private readonly firebase = inject(FirebaseClientService);
  private readonly maxBytes = 3 * 1024 * 1024;

  async upload(file: File, kind: CdnImageKind, recordId: string): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Elige una imagen JPG, PNG o WebP.');
    }
    if (file.size > this.maxBytes) {
      throw new Error('La imagen debe pesar 3 MB o menos para publicarse en el CDN.');
    }
    const user = this.firebase.auth.currentUser;
    if (!user) throw new Error('Tu sesión expiró. Inicia sesión nuevamente antes de subir una imagen.');
    const idToken = await user.getIdToken();
    const imageBase64 = await this.toBase64(file);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/image-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ kind, recordId, contentType: file.type, imageBase64 }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as CdnUploadResponse;
      if (!response.ok) throw new Error(result.message || 'No se pudo publicar la imagen en jsDelivr.');
      if (!result.imageUrl || !result.imageUrl.startsWith('https://cdn.jsdelivr.net/gh/XitoDev/starkies@')) {
        throw new Error('El servidor no devolvió una URL válida del CDN.');
      }
      return result.imageUrl;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('La publicación de la imagen tardó demasiado. La receta no se guardó; inténtalo nuevamente.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
      reader.onload = () => {
        const value = String(reader.result ?? '');
        const comma = value.indexOf(',');
        if (comma < 0) reject(new Error('El archivo de imagen no tiene un formato válido.'));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }
}
