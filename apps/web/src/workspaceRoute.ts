import type { Page } from './types';

export type WorkspaceRoute = {
  page: Page;
  storyId?: string | null;
  reading?: boolean;
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STORY = new RegExp('^/historia/(' + UUID + ')(/leer)?$', 'i');
const CREATOR = new RegExp('^/creator/(' + UUID + ')

const STATIC: Record<string, Page> = {
  '/biblioteca': 'inicio',
  '/descubrir': 'descubrir',
  '/creator': 'crear',
  '/modelos': 'modelos',
  '/descargas': 'descargas',
  '/configuracion': 'ajustes',
  '/diagnostico': 'diagnostico',
  '/infraestructura': 'diagnostico',
};

const URLS: Record<Page, string> = {
  inicio: '/biblioteca',
  descubrir: '/descubrir',
  crear: '/creator',
  modelos: '/modelos',
  descargas: '/descargas',
  ajustes: '/configuracion',
  diagnostico: '/diagnostico',
};

/** Hash URLs work on the local FastAPI/static frontend without SPA rewrites. */
export function parseWorkspaceHash(hash: string): WorkspaceRoute {
  const path = hash.replace(/^#/, '').replace(/\/$/, '') || '/modelos';
  const matchStory = STORY.exec(path);
  if (matchStory) return {
    page: 'inicio', storyId: matchStory[1].toLowerCase(),
    reading: Boolean(matchStory[2]),
  };
  const matchCreator = CREATOR.exec(path);
  if (matchCreator) return { page: 'crear', storyId: matchCreator[1].toLowerCase() };
  const settingsMatch = /^\/configuracion\/([a-z-]+)$/i.exec(path);
  if (settingsMatch && SETTINGS_SECTIONS.has(settingsMatch[1].toLowerCase()))
    return { page: 'ajustes' };
  const page = STATIC[path.toLowerCase()];
  return { page: page || 'modelos' };
}

export function hashForWorkspaceRoute(route: WorkspaceRoute): string {
  if (route.storyId) {
    const ident = route.storyId.toLowerCase();
    if (!new RegExp('^' + UUID + '$').test(ident))
      throw new Error('Identificador de historia inválido');
    if (route.page === 'inicio')
      return '#/historia/' + ident + (route.reading ? '/leer' : '');
    if (route.page === 'crear') return '#/creator/' + ident;
  }
  return '#' + URLS[route.page];
}
, 'i');
const SETTINGS_SECTIONS = new Set([
  'overview', 'narration', 'images', 'voice', 'languages', 'providers',
  'appearance', 'runtimes', 'shortcuts', 'network', 'about', 'updates',
  'multimedia', // Retain legacy links, which open the image panel.
]);

const STATIC: Record<string, Page> = {
  '/biblioteca': 'inicio',
  '/descubrir': 'descubrir',
  '/creator': 'crear',
  '/modelos': 'modelos',
  '/descargas': 'descargas',
  '/configuracion': 'ajustes',
  '/diagnostico': 'diagnostico',
  '/infraestructura': 'diagnostico',
};

const URLS: Record<Page, string> = {
  inicio: '/biblioteca',
  descubrir: '/descubrir',
  crear: '/creator',
  modelos: '/modelos',
  descargas: '/descargas',
  ajustes: '/configuracion',
  diagnostico: '/diagnostico',
};

/** Hash URLs work on the local FastAPI/static frontend without SPA rewrites. */
export function parseWorkspaceHash(hash: string): WorkspaceRoute {
  const path = hash.replace(/^#/, '').replace(/\/$/, '') || '/modelos';
  const matchStory = STORY.exec(path);
  if (matchStory) return {
    page: 'inicio', storyId: matchStory[1].toLowerCase(),
    reading: Boolean(matchStory[2]),
  };
  const matchCreator = CREATOR.exec(path);
  if (matchCreator) return { page: 'crear', storyId: matchCreator[1].toLowerCase() };
  const page = STATIC[path.toLowerCase()];
  return { page: page || 'modelos' };
}

export function hashForWorkspaceRoute(route: WorkspaceRoute): string {
  if (route.storyId) {
    const ident = route.storyId.toLowerCase();
    if (!new RegExp('^' + UUID + '$').test(ident))
      throw new Error('Identificador de historia inválido');
    if (route.page === 'inicio')
      return '#/historia/' + ident + (route.reading ? '/leer' : '');
    if (route.page === 'crear') return '#/creator/' + ident;
  }
  return '#' + URLS[route.page];
}
