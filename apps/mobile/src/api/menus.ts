import { apiFetch } from "./client";
import type {
  MenuListItem,
  MenuDetail,
  CreateMenuRequest,
  PatchMenuRequest,
  AddMenuItemRequest,
  PatchMenuItemRequest,
  MenuDish,
} from "@atelier/shared";

export type Menu = MenuListItem;
export type MenuFull = MenuDetail;
export type Dish = MenuDish;

export const listMenus = () => apiFetch<Menu[]>("/api/menus");
export const getMenu = (id: string) => apiFetch<MenuFull>(`/api/menus/${id}`);
export const createMenu = (data: CreateMenuRequest) =>
  apiFetch<Menu>("/api/menus", { method: "POST", body: JSON.stringify(data) });
export const patchMenu = (id: string, data: PatchMenuRequest) =>
  apiFetch<MenuFull>(`/api/menus/${id}`, { method: "PATCH", body: JSON.stringify(data) });
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
