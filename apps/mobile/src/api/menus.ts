import { apiFetch } from "./client";
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

export const listMenus = () => apiFetch<Menu[]>("/api/menus");
export const getMenu = (id: string) => apiFetch<MenuFull>(`/api/menus/${id}`);
export const createMenu = (data: CreateMenuRequest) =>
  apiFetch<Menu>("/api/menus", { method: "POST", body: JSON.stringify(data) });
export const patchMenu = (id: string, data: PatchMenuRequest) =>
  apiFetch<MenuFull>(`/api/menus/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMenu = (id: string) =>
  apiFetch<null>(`/api/menus/${id}`, { method: "DELETE" });
export const addMenuItem = (menuId: string, data: AddMenuItemRequest) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const patchMenuItem = (menuId: string, itemId: string, data: PatchMenuItemRequest) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteMenuItem = (menuId: string, itemId: string) =>
  apiFetch<{ ok: boolean }>(`/api/menus/${menuId}/items/${itemId}`, { method: "DELETE" });

// Reorder atómico — el server hace $transaction; el cliente no se preocupa
// por races entre dos PATCH.
export const reorderMenuItems = (menuId: string, itemAId: string, itemBId: string) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/items/reorder`, {
    method: "POST",
    body: JSON.stringify({ itemAId, itemBId }),
  });

export const createSection = (menuId: string, data: CreateMenuSectionRequest) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/sections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const patchSection = (
  menuId: string,
  sectionId: string,
  data: PatchMenuSectionRequest,
) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteSection = (menuId: string, sectionId: string) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/sections/${sectionId}`, {
    method: "DELETE",
  });

// Vista cliente — capa cosmética solo-PDF. Reemplaza el JSON entero.
export const patchClientOverrides = (
  menuId: string,
  data: PatchClientOverridesRequest,
) =>
  apiFetch<MenuFull>(`/api/menus/${menuId}/client-override`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
