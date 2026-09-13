import { describe, it, expect } from "vitest";
import { assessFacts, selectEvidence, recipeEvidence, validFacts, evidenceHash, memoryContext, type EvidenceRecipe } from "./evidence";
import { memoryPayload } from "./provider";
const recipe = (id: string, state = "in_test", extra = {}): EvidenceRecipe => ({ id, state, title: id, updatedAt: new Date(),
  contentJson: { ingredients: [`200 g ${id}`], method: [`Asar ${id} durante 20 minutos`] }, recipeIngredients: [], ...extra });
describe("culinary evidence", () => {
  it("excluye borradores y equilibra aprobadas/en prueba", () => {
    const input = [...Array.from({ length: 15 }, (_, i) => recipe(`a${i}`, "approved")), ...Array.from({ length: 15 }, (_, i) => recipe(`t${i}`)), recipe("draft", "draft")];
    const selected = selectEvidence(input);
    expect(selected).toHaveLength(20);
    expect(selected.filter(r => r.state === "approved")).toHaveLength(10);
    expect(selected.some(r => r.id === "draft")).toBe(false);
  });
  it("copias escaladas y con otro título cuentan como una elaboración", () => {
    const scaled = recipe("copy", "approved", { contentJson: { ingredients: ["400 g tomate"], method: ["Asar tomate durante 40 minutos"] } });
    const base = recipe("base", "in_test", { contentJson: { ingredients: ["200 g tomate"], method: ["Asar tomate durante 20 minutos"] } });
    expect(selectEvidence([base, scaled])).toHaveLength(1);
    expect(selectEvidence([base, scaled])[0]!.state).toBe("approved");
  });
  it("costes y notas no influyen en la huella ni salen al proveedor", () => {
    const a = recipe("tomate");
    const b = { ...a, updatedAt: new Date(0), contentJson: { ...(a.contentJson as object), notes: "precio secreto 999" } };
    expect(recipeEvidence(a).hash).toBe(recipeEvidence(b).hash);
    expect(memoryPayload({ evidence: [recipeEvidence(b)], identity: null, corrections: [], excluded: [], language: "es" })).not.toContain("secreto");
  });
  it("retira tendencias que pierden tres fuentes válidas o cambian de contenido", () => {
    const evidence = [recipe("a"), recipe("b"), recipe("c")].map(recipeEvidence);
    const fact = { key: "techniques" as const, text: "Predominan asados", sources: evidence.map(e => ({ id: e.id, hash: e.hash, version: 2 as const })) };
    expect(validFacts([fact], evidence)).toHaveLength(1);
    expect(validFacts([fact], evidence.slice(1))).toHaveLength(0);
    expect(validFacts([fact], [...evidence.slice(0, 2), { ...evidence[2]!, hash: "changed" }])).toHaveLength(0);
  });
  it("mantiene fuentes v2 al renombrar o aprobar sin cambiar la elaboración", () => {
    const originals = ["a", "b", "c"].map(id => recipeEvidence(recipe(id)));
    const fact = { key: "techniques" as const, text: "Predominan asados", sources: originals.map(e => ({ id: e.id, hash: e.hash, version: 2 as const })) };
    const current = ["a", "b", "c"].map(id => recipeEvidence(recipe(id, "approved", { title: `Nuevo ${id}` })));
    expect(current.map(e => e.hash)).toEqual(originals.map(e => e.hash));
    expect(validFacts([fact], current)).toEqual([fact]);
  });
  it("migra hashes legacy sólo si todavía se pueden verificar", () => {
    const before = ["a", "b", "c"].map(id => recipeEvidence(recipe(id, "in_test")));
    const legacy = { key: "techniques" as const, text: "Predominan asados", sources: before.map(e => ({ id: e.id, hash: e.legacyHashes.in_test })) };
    const approved = ["a", "b", "c"].map(id => recipeEvidence(recipe(id, "approved")));
    expect(validFacts([legacy], approved)[0]?.sources).toEqual(approved.map(e => ({ id: e.id, hash: e.hash, version: 2 })));

    const renamed = approved.map(e => e.id === "c" ? recipeEvidence(recipe("c", "approved", { title: "Título irreconocible" })) : e);
    expect(validFacts([legacy], renamed)).toHaveLength(0);
    const changed = approved.map(e => e.id === "c" ? recipeEvidence(recipe("c", "approved", { contentJson: { ingredients: ["200 g c"], method: ["Hervir c"] } })) : e);
    expect(validFacts([legacy], changed)).toHaveLength(0);
  });
  it("oculta una tendencia sin borrar sus fuentes cuando una receta va a papelera", () => {
    const current = ["a", "b", "c"].map(id => recipeEvidence(recipe(id, "approved")));
    const fact = { key: "techniques" as const, text: "Predominan asados", sources: current.map(e => ({ id: e.id, hash: e.hash, version: 2 as const })) };
    const assessed = assessFacts([fact], current.slice(0, 2));
    expect(assessed.valid).toEqual([]);
    expect(assessed.migrated).toEqual([fact]);
    expect(assessFacts(assessed.migrated, current).valid).toEqual([fact]);
  });
  it("correcciones prevalecen y categorías excluidas no reaparecen en contexto", () => {
    const context = memoryContext([{ key: "cuisine", text: "Cocina vegetal" }], [
      { key: "cuisine", text: "Antigua", sources: [] }, { key: "techniques", text: "Olvidada", sources: [] },
    ], ["techniques"]);
    expect(context).toContain("Cocina vegetal"); expect(context).not.toContain("Antigua"); expect(context).not.toContain("Olvidada");
    expect(context).toContain("petición actual del chef prevalece");
  });
  it("el orden de consulta no provoca una llamada nueva", () => {
    const es = [recipeEvidence(recipe("a")), recipeEvidence(recipe("b"))];
    expect(evidenceHash(es, null, [], [])).toBe(evidenceHash([...es].reverse(), null, [], []));
  });
  it("la entrada al proveedor está acotada incluso con recetas largas", () => {
    const es = Array.from({ length: 20 }, (_, i) => recipeEvidence(recipe(String(i), "approved", { title: "x".repeat(500), contentJson: { ingredients: ["x".repeat(25000)], method: ["x".repeat(25000)] } })));
    expect(memoryPayload({ evidence: es, identity: "a".repeat(1000), corrections: [], excluded: [], language: "es" }).length).toBeLessThanOrEqual(20_000);
  });
});
