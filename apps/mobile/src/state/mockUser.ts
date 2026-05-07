// Phase-0 mock state. Mirrors INITIAL_STATE from project/data.jsx so the
// scaffolded UI looks like Andrea Conti at Ristorante Marche. Phase 1
// replaces this with a useMe() hook backed by GET /api/me.

import { useSyncExternalStore } from "react";
import type { Role } from "@atelier/shared";

export type MockUser = {
  name: string;
  initials: string;
  email: string;
  bio: string;
  role: Role;
  defaultModel: "sonnet" | "opus";
};

export type MockRestaurant = {
  name: string;
  initial: string;
  identityLine: string;
  inviteCode: string;
};

export type MockStaffMember = {
  id: string;
  name: string;
  initials: string;
  role: Role;
};

let user: MockUser = {
  name: "Andrea Conti",
  initials: "AC",
  email: "andrea@ristorantemarche.it",
  bio: "Cocina mediterránea de raíz, técnica francesa.",
  role: "admin",
  defaultModel: "sonnet",
};

const restaurant: MockRestaurant = {
  name: "Ristorante Marche",
  initial: "M",
  identityLine: "Cocina mediterránea de raíz, técnica francesa, mano japonesa.",
  inviteCode: "MARCHE-A7K2",
};

const staff: ReadonlyArray<MockStaffMember> = [
  { id: "u1", name: "Andrea Conti", initials: "AC", role: "admin" },
  { id: "u2", name: "Marco Rossi", initials: "MR", role: "chef_executive" },
  { id: "u3", name: "Luca Bianchi", initials: "LB", role: "sous_chef" },
  { id: "u4", name: "Sofia Marchetti", initials: "SM", role: "viewer" },
];

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function setMockRole(role: Role) {
  user = { ...user, role };
  notify();
}

export function setMockModel(model: "sonnet" | "opus") {
  user = { ...user, defaultModel: model };
  notify();
}

export function getMockUser(): MockUser {
  return user;
}

export function getMockRestaurant(): MockRestaurant {
  return restaurant;
}

export function getMockStaff(): ReadonlyArray<MockStaffMember> {
  return staff;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMockUser(): MockUser {
  return useSyncExternalStore(subscribe, getMockUser, getMockUser);
}
