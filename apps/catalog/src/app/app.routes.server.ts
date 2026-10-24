import { RenderMode, type ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'menu', renderMode: RenderMode.Prerender },
  // Keep the server route table aligned with the client wildcard route.
  // Unknown paths are handled by the client router's redirect to the landing page.
  { path: '**', renderMode: RenderMode.Server },
];
