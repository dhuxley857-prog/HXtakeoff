export type SpecificationSystem =
  | "substructure"
  | "external-wall"
  | "internal-wall"
  | "floor"
  | "ceiling"
  | "roof"
  | "openings"
  | "finishes"
  | "drainage"
  | "rainwater"
  | "mechanical"
  | "electrical"
  | "general";

export type SpecificationClause = {
  document: string;
  page: number;
  clauseRef: string | null;
  section: string | null;
  system: SpecificationSystem;
  text: string;
};

const rules: [SpecificationSystem, RegExp][] = [
  ["substructure", /foundation|footing|substructure|excavat|groundwork/i],
  [
    "external-wall",
    /external wall|facing brick|brickwork|stonework|render|cladding/i,
  ],
  ["internal-wall", /partition|stud wall|blockwork|wall lining|plasterboard/i],
  ["roof", /roof|eaves|verge|fascia|soffit/i],
  ["ceiling", /ceiling|soffit/i],
  ["floor", /ground floor|floor build|floor finish|slab|dpm|screed/i],
  ["openings", /window|door|glazing|ironmongery|lintel/i],
  ["finishes", /skirting|tile|tiling|decorat|paint|carpet|vinyl/i],
  ["rainwater", /rainwater|rwp|gutter|downpipe/i],
  ["drainage", /drain|soil pipe|waste pipe|sewer/i],
  ["electrical", /electrical|socket|lighting|light fitting/i],
  ["mechanical", /heating|plumbing|ventilation|extract|radiator|boiler/i],
];

export function classifySpecificationClause(
  text: string,
  document: string,
  page: number,
): SpecificationClause {
  const clean = text.replace(/\s+/g, " ").trim(),
    clauseRef =
      clean.match(/^((?:\d+\.)*\d+|[A-Z]\d+(?:\.\d+)*)\b/)?.[1] || null,
    sectionText = clean.match(/^([^:]{3,80}):/)?.[1]?.trim() || null,
    system = rules.find(([, pattern]) => pattern.test(clean))?.[0] || "general";
  return {
    document,
    page,
    clauseRef,
    section: sectionText,
    system,
    text: clean,
  };
}

export function formatSpecificationRef(clause: SpecificationClause) {
  return `${clause.document} P${clause.page}${clause.clauseRef ? ` §${clause.clauseRef}` : ""} [${clause.system}]`;
}
