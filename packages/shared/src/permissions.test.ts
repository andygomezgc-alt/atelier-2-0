import { describe, expect, it } from "vitest";
import { can, type Permission } from "./permissions";

const ALL_ROLES = ["admin", "chef_executive", "sous_chef", "viewer"] as const;

const EXPECTED: Record<Permission, ReadonlyArray<typeof ALL_ROLES[number]>> = {
  capture_idea: ["admin", "chef_executive", "sous_chef"],
  edit_recipe: ["admin", "chef_executive", "sous_chef"],
  advance_to_test: ["admin", "chef_executive", "sous_chef"],
  approve_recipe: ["admin", "chef_executive"],
  create_menu: ["admin", "chef_executive", "sous_chef"],
  edit_menu: ["admin", "chef_executive", "sous_chef"],
  view_staff_recipe: ["admin", "chef_executive", "sous_chef"],
  export_pdf: ["admin", "chef_executive", "sous_chef", "viewer"],
  view_invite_code: ["admin"],
  manage_members: ["admin"],
  change_role: ["admin"],
  edit_restaurant: ["admin"],
};

describe("permissions matrix (brief sec. 5)", () => {
  for (const permission of Object.keys(EXPECTED) as Permission[]) {
    for (const role of ALL_ROLES) {
      const expected = EXPECTED[permission].includes(role);
      it(`${role} ${expected ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }
});
