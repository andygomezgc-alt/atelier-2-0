import { apiFetch, ApiError, NetworkError, TOKEN_KEY } from "./client";
import { cached, invalidate, setCached } from "./cache";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "@/src/lib/secure-storage";
import {
  MenuStyleUploadResponseSchema,
  type MenuStyleUploadResponse,
  type MenuStyleHistory,
  type MenuListItem,
  type MenuDetail,
  type CreateMenuRequest,
  type PatchMenuRequest,
  type AddMenuItemRequest,
  type PatchMenuItemRequest,
  type MenuDish,
  type MenuSection,
  type CreateMenuSectionRequest,
  type PatchMenuSectionRequest,
  type ClientOverrides,
  type PatchClientOverridesRequest,
  type ApiErrorCode,
} from "@atelier/shared";

export type { ClientOverrides };

export type Menu = MenuListItem;
export type MenuFull = MenuDetail;
export type Dish = MenuDish;
export type Section = MenuSection;

const MENUS_TTL_MS = 30_000;
// Las mutaciones de menú devuelven el MenuFull entero — aprovechamos para
// pre-popular el caché del detalle y evitar un refetch inmediato.
function bumpMenuCache(menu: MenuFull): MenuFull {
  setCached(`menus:detail:${menu.id}`, menu);
  invalidate("menus:list");
  return menu;
}

export const listMenus = (trash = false) =>
  cached(
    trash ? "menus:trash" : "menus:list",
    () => apiFetch<Menu[]>(`/api/menus${trash ? "?trash=true" : ""}`),
    MENUS_TTL_MS,
  );

export const getMenu = (id: string) =>
  cached(`menus:detail:${id}`, () => apiFetch<MenuFull>(`/api/menus/${id}`), MENUS_TTL_MS);

export const createMenu = async (data: CreateMenuRequest) => {
  const result = await apiFetch<Menu>("/api/menus", { method: "POST", body: JSON.stringify(data) });
  invalidate("menus:");
  return result;
};
// Bug chips fantasma: recipe.menus (el chip "en qué carta está" del detalle
// de receta) embebe id+name del menú. Renombrar/editar el menú deja ese
// embed viejo en el caché de recetas hasta 30s. Invalidamos recipes: acá.
export const patchMenu = async (id: string, data: PatchMenuRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidate("recipes:");
  return bumpMenuCache(result);
};
// Bug chips fantasma: borrar el menú saca las recetas que tenía de sus
// chips "en qué carta está" — sin esto, esas recetas seguían mostrando el
// menú borrado hasta que expirara el caché.
export const deleteMenu = async (id: string) => {
  const result = await apiFetch<null>(`/api/menus/${id}`, { method: "DELETE" });
  invalidate("menus:");
  invalidate("recipes:");
  return result;
};
// Duplicar un menú como copia (variante de carta). Devuelve el menú nuevo.
// Bug chips fantasma: la copia trae los mismos platos → las recetas
// correspondientes ahora están también en este menú nuevo.
export const duplicateMenu = async (id: string) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${id}/duplicate`, { method: "POST" });
  invalidate("menus:");
  invalidate("recipes:");
  return result;
};
// Restaurar un menú desde la papelera.
// Bug chips fantasma: sus recetas vuelven a estar "en carta" — refrescar.
export const restoreMenu = async (id: string) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${id}/restore`, { method: "POST" });
  invalidate("menus:");
  invalidate("recipes:");
  return result;
};
// Bug chips fantasma: agregar un plato mete la receta en este menú — su
// chip "en qué carta está" queda desactualizado sin este invalidate.
export const addMenuItem = async (menuId: string, data: AddMenuItemRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidate("recipes:");
  return bumpMenuCache(result);
};
export const patchMenuItem = async (menuId: string, itemId: string, data: PatchMenuItemRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
// Bug chips fantasma: borrar un plato saca la receta de este menú — su
// chip "en qué carta está" queda desactualizado sin este invalidate.
export const deleteMenuItem = async (menuId: string, itemId: string) => {
  const result = await apiFetch<{ ok: boolean }>(`/api/menus/${menuId}/items/${itemId}`, {
    method: "DELETE",
  });
  invalidate("menus:");
  invalidate("recipes:");
  return result;
};

// Reorder atómico — el server hace $transaction; el cliente no se preocupa
// por races entre dos PATCH.
export const reorderMenuItems = async (menuId: string, itemAId: string, itemBId: string) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/items/reorder`, {
    method: "POST",
    body: JSON.stringify({ itemAId, itemBId }),
  });
  return bumpMenuCache(result);
};

export const createSection = async (menuId: string, data: CreateMenuSectionRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/sections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
export const patchSection = async (
  menuId: string,
  sectionId: string,
  data: PatchMenuSectionRequest,
) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
export const deleteSection = async (menuId: string, sectionId: string) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/sections/${sectionId}`, {
    method: "DELETE",
  });
  return bumpMenuCache(result);
};

// Vista cliente — capa cosmética solo-PDF. Reemplaza el JSON entero.
export const patchClientOverrides = async (
  menuId: string,
  data: PatchClientOverridesRequest,
) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/client-override`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};

// Generación y revisión visual: respetar el presupuesto de 300s del servidor.
const STYLE_UPLOAD_TIMEOUT_MS = 310_000;

// "Tu estilo" — sube una foto o PDF de la carta real; el server (visión)
// extrae el estilo y guarda una propuesta pendiente de revisión.
// createUploadTask (en vez de uploadAsync)
// da una tarea cancelable: así el timeout de arriba puede cortar el upload
// en vez de dejarlo colgado si el server nunca responde.
export async function uploadMenuStyleFile(
  uri: string,
  mimeType: string,
): Promise<MenuStyleUploadResponse> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);

  const task = FileSystem.createUploadTask(
    `${base}/api/restaurant/menu-style/from-image`,
    uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  let res: FileSystem.FileSystemUploadResult | undefined | null;
  // Flag para distinguir el timeout de una falla de red genérica: solo si
  // NUESTRO setTimeout canceló la tarea etiquetamos "request_timeout"; el
  // resto cae al default de NetworkError ("network_unreachable").
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void task.cancelAsync();
  }, STYLE_UPLOAD_TIMEOUT_MS);
  try {
    res = await task.uploadAsync();
  } catch {
    throw new NetworkError(timedOut ? "request_timeout" : undefined);
  } finally {
    clearTimeout(timer);
  }

  // `undefined`/`null` = la tarea fue cancelada (timeout de arriba u otra
  // cancelación externa) sin llegar a resolver con una respuesta HTTP.
  if (!res) throw new NetworkError(timedOut ? "request_timeout" : undefined);

  if (res.status < 200 || res.status >= 300) {
    let message = `HTTP ${res.status}`;
    let code: ApiErrorCode | undefined;
    try {
      const json = JSON.parse(res.body);
      message = json?.error ?? message;
      if (typeof json?.code === "string") code = json.code as ApiErrorCode;
    } catch {}
    throw new ApiError(res.status, message, code);
  }

  invalidate("menus:");

  // La propuesta puede estar guardada aunque falle leer la respuesta.
  // El historial permite recuperarla sin volver a llamar al modelo.
  let rawSpec: unknown = null;
  try {
    rawSpec = JSON.parse(res.body);
  } catch {}

  const parsed = MenuStyleUploadResponseSchema.safeParse(rawSpec);
  if (!parsed.success) {
    console.warn("menu_style_spec_unparseable", parsed.error);
    throw new ApiError(502, "Invalid style response", "menu_style_extraction_failed");
  }
  return parsed.data;
}

export const getMenuStyleHistory = () => apiFetch<MenuStyleHistory>("/api/restaurant/menu-style");
export const activateMenuStyleVersion = async (versionId: string, expectedActiveVersionId: string | null, menuId: string) => {
  const result = await apiFetch(`/api/restaurant/menu-style/${encodeURIComponent(versionId)}`, {
    method: "POST", body: JSON.stringify({ expectedActiveVersionId, menuId }),
  });
  invalidate("menus:");
  return result;
};
export const discardMenuStyleVersion = (versionId: string) => apiFetch(`/api/restaurant/menu-style/${encodeURIComponent(versionId)}`, { method: "DELETE" });
