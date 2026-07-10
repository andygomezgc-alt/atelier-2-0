import { apiFetch } from "./client";
import { cached, invalidate, setCached } from "./cache";
import type {
  MenuListItem,
  MenuDetail,
  CreateMenuRequest,
  PatchMenuRequest,
  AddMenuItemRequest,
  PatchMenuItemRequest,
  MenuDish,
  MenuSection,
  CreateMenuSectionRequest,
  PatchMenuSectionRequest,
  ClientOverrides,
  PatchClientOverridesRequest,
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

export const listMenus = () =>
  cached("menus:list", () => apiFetch<Menu[]>("/api/menus"), MENUS_TTL_MS);

export const getMenu = (id: string) =>
  cached(`menus:detail:${id}`, () => apiFetch<MenuFull>(`/api/menus/${id}`), MENUS_TTL_MS);

export const createMenu = async (data: CreateMenuRequest) => {
  const result = await apiFetch<Menu>("/api/menus", { method: "POST", body: JSON.stringify(data) });
  invalidate("menus:");
  return result;
};
export const patchMenu = async (id: string, data: PatchMenuRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
export const deleteMenu = async (id: string) => {
  const result = await apiFetch<null>(`/api/menus/${id}`, { method: "DELETE" });
  invalidate("menus:");
  return result;
};
// Duplicar un menú como copia (variante de carta). Devuelve el menú nuevo.
export const duplicateMenu = async (id: string) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${id}/duplicate`, { method: "POST" });
  invalidate("menus:");
  return result;
};
export const addMenuItem = async (menuId: string, data: AddMenuItemRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
export const patchMenuItem = async (menuId: string, itemId: string, data: PatchMenuItemRequest) => {
  const result = await apiFetch<MenuFull>(`/api/menus/${menuId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpMenuCache(result);
};
export const deleteMenuItem = async (menuId: string, itemId: string) => {
  const result = await apiFetch<{ ok: boolean }>(`/api/menus/${menuId}/items/${itemId}`, {
    method: "DELETE",
  });
  invalidate("menus:");
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
