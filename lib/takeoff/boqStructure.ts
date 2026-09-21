export type BoqSection = "PRELIMINARIES" | "EXTERNAL" | "ROOM";

export type BoqScopeRow = {
  id: string;
  page: number;
  room: string;
  item: string;
  unit: "m²" | "m" | "nr" | "m³" | "item";
  qty: number;
  scope: string;
  evidence: string;
  status: "UNMEASURED";
  section: BoqSection;
  tradeCode: string;
  sortOrder: number;
};

type ScopeTemplate = {
  code: string;
  item: string;
  unit: BoqScopeRow["unit"];
  scope: string;
};

const preliminaries: ScopeTemplate[] = [
  [
    "P01",
    "Project management and site supervision",
    "item",
    "Management, coordination, progress reporting and site supervision.",
  ],
  [
    "P02",
    "Mobilisation, site establishment and demobilisation",
    "item",
    "Set up, maintain and clear the site establishment.",
  ],
  [
    "P03",
    "Welfare and temporary accommodation",
    "item",
    "Statutory welfare, offices, storage and temporary accommodation.",
  ],
  [
    "P04",
    "Temporary services",
    "item",
    "Temporary power, water, lighting, communications and distribution.",
  ],
  [
    "P05",
    "Health, safety and CDM compliance",
    "item",
    "Construction phase planning, inspections, records and statutory duties.",
  ],
  [
    "P06",
    "Access, logistics, hoarding and security",
    "item",
    "Site access, deliveries, hoarding, signage and security controls.",
  ],
  [
    "P07",
    "Scaffolding and temporary access",
    "item",
    "Scaffolds, towers, edge protection and temporary working platforms.",
  ],
  [
    "P08",
    "Surveys, setting out and monitoring",
    "item",
    "Pre-start records, setting out, dimensional control and monitoring.",
  ],
  [
    "P09",
    "Design coordination and submittals",
    "item",
    "Contractor design portions, temporary works, samples and technical submittals.",
  ],
  [
    "P10",
    "Protection of existing work and adjoining property",
    "item",
    "Protection, dust/noise control and making good to retained work.",
  ],
  [
    "P11",
    "Statutory fees, permits and notices",
    "item",
    "Construction-stage permits, notices, inspections and attendance.",
  ],
  [
    "P12",
    "Insurances, bonds and warranties",
    "item",
    "Project-specific insurances, securities and collateral warranties.",
  ],
  [
    "P13",
    "Testing, commissioning and certification",
    "item",
    "Testing, commissioning, demonstrations and compliance certification.",
  ],
  [
    "P14",
    "Waste management and final cleaning",
    "item",
    "Waste segregation, removal, final clean and readiness for occupation.",
  ],
  [
    "P15",
    "Handover information and defects attendance",
    "item",
    "As-built information, O&M manuals, warranties, training and defects attendance.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const external: ScopeTemplate[] = [
  [
    "E01",
    "Enabling works and site clearance",
    "item",
    "Demolition, removals and clearance explicitly supported by the coordinated pack.",
  ],
  [
    "E02",
    "Excavation and earthworks",
    "m³",
    "Excavation, disposal, filling and compaction.",
  ],
  [
    "E03",
    "Foundations and substructure",
    "m³",
    "Footings, foundation walls, substructure concrete and masonry.",
  ],
  [
    "E04",
    "Ground-floor construction",
    "m²",
    "Slab, membranes, insulation, screed and associated build-up.",
  ],
  [
    "E05",
    "External wall construction",
    "m²",
    "Structural wall, cavity, insulation, membranes and internal backing.",
  ],
  [
    "E06",
    "External wall finishes",
    "m²",
    "Brick, render, cladding or other elevation finish separated by evidence.",
  ],
  [
    "E07",
    "Roof structure",
    "m²",
    "Primary and secondary roof structure and associated carpentry.",
  ],
  [
    "E08",
    "Roof coverings and insulation",
    "m²",
    "Roof finish, underlay, battens, insulation, flashings and interfaces.",
  ],
  [
    "E09",
    "Roof edges and penetrations",
    "m",
    "Eaves, verges, ridges, valleys, abutments and supported penetrations.",
  ],
  [
    "E10",
    "Windows and external glazing",
    "nr",
    "Windows, glazing, cills, lintels, reveals and perimeter interfaces.",
  ],
  [
    "E11",
    "External doors",
    "nr",
    "External doorsets, frames, glazing, ironmongery and interfaces.",
  ],
  [
    "E12",
    "Rainwater goods",
    "m",
    "Gutters, outlets, downpipes, shoes and connections.",
  ],
  [
    "E13",
    "Below-ground drainage",
    "m",
    "Foul and surface-water pipework, fittings, chambers and connections.",
  ],
  [
    "E14",
    "External services and incoming supplies",
    "item",
    "Measurable incoming service routes, ducts and external interfaces.",
  ],
  [
    "E15",
    "Paving, paths and hard landscaping",
    "m²",
    "Supported paving, paths, steps, edgings and hard landscaping.",
  ],
  [
    "E16",
    "Soft landscaping and boundaries",
    "item",
    "Supported planting, turf, fences, walls, gates and boundary work.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const roomCommon: ScopeTemplate[] = [
  [
    "R01",
    "Internal partitions and wall build-ups",
    "m²",
    "Partitions, linings, insulation, fire/acoustic layers and associated framing.",
  ],
  [
    "R02",
    "Wall plaster and dry lining",
    "m²",
    "Plasterboard, plaster, beads, trims and making good.",
  ],
  [
    "R03",
    "Wall finishes and decorations",
    "m²",
    "Paint, paper or other room wall finish, net of supported openings.",
  ],
  [
    "R04",
    "Floor finish",
    "m²",
    "Room floor finish, underlay, adhesive, trims and interfaces.",
  ],
  [
    "R05",
    "Skirtings and perimeter trims",
    "m",
    "Skirting and perimeter trims, net of supported door openings.",
  ],
  [
    "R06",
    "Ceiling finish and decorations",
    "m²",
    "Ceiling lining, finish, decoration and associated trims.",
  ],
  [
    "R07",
    "Internal doors, frames and ironmongery",
    "nr",
    "Room-associated doorsets, frames, architraves, stops and ironmongery.",
  ],
  [
    "R08",
    "Windows, internal reveals and boards",
    "nr",
    "Room-facing window work, reveals, boards and finish interfaces.",
  ],
  [
    "R09",
    "Joinery and fitted items",
    "item",
    "Room-specific joinery and fitted items explicitly shown or scheduled.",
  ],
  [
    "R10",
    "Electrical power and accessories",
    "nr",
    "Sockets, switches, controls and other measurable room accessories.",
  ],
  [
    "R11",
    "Lighting",
    "nr",
    "Luminaires and room lighting accessories explicitly shown.",
  ],
  [
    "R12",
    "Heating",
    "nr",
    "Emitters, controls and measurable room heating components.",
  ],
  [
    "R13",
    "Ventilation",
    "nr",
    "Terminals, extract points and measurable room ventilation components.",
  ],
  [
    "R14",
    "Fire stopping and protection",
    "item",
    "Room-specific fire stopping and protection supported by coordinated details.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const kitchen: ScopeTemplate[] = [
  [
    "K01",
    "Kitchen units, worktops and fitted equipment",
    "item",
    "Base/wall units, worktops, panels, fittings and scheduled equipment.",
  ],
  [
    "K02",
    "Kitchen plumbing and above-ground drainage",
    "item",
    "Sinks, taps, appliance connections, wastes and local pipework.",
  ],
  [
    "K03",
    "Kitchen splashbacks and wall tiling",
    "m²",
    "Splashbacks, wall tiling, trims, adhesive and grout.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const wetRoom: ScopeTemplate[] = [
  [
    "W01",
    "Sanitaryware and bathroom fittings",
    "nr",
    "Sanitary appliances, brassware, screens and scheduled bathroom fittings.",
  ],
  [
    "W02",
    "Wet-room plumbing and above-ground drainage",
    "item",
    "Water services, traps, wastes and local above-ground drainage.",
  ],
  [
    "W03",
    "Waterproofing and tanking",
    "m²",
    "Supported tanking, waterproof membranes and sealed interfaces.",
  ],
  [
    "W04",
    "Wall tiling",
    "m²",
    "Wall tiles, trims, adhesive, grout and sealant.",
  ],
  [
    "W05",
    "Floor tiling",
    "m²",
    "Floor tiles, preparation, adhesive, grout and junctions.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const utility: ScopeTemplate[] = [
  [
    "U01",
    "Utility fittings and worktops",
    "item",
    "Supported utility units, worktops and fitted equipment.",
  ],
  [
    "U02",
    "Utility plumbing and drainage",
    "item",
    "Appliance connections, sink services, wastes and local pipework.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const circulation: ScopeTemplate[] = [
  [
    "C01",
    "Staircase, balustrades and handrails",
    "item",
    "Stair, guarding, balustrades and handrails associated with the circulation space.",
  ],
].map(([code, item, unit, scope]) => ({
  code,
  item,
  unit,
  scope,
})) as ScopeTemplate[];

const slug = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const pending = "TEST 001 · evidence pending · no quantity assumed";

const makeRows = (
  templates: ScopeTemplate[],
  section: BoqSection,
  location: string,
  prefix: string,
  start: number,
): BoqScopeRow[] =>
  templates.map((template, index) => ({
    id: `T001-${prefix}-${template.code}`,
    page: 0,
    room: location,
    item: template.item,
    unit: template.unit,
    qty: 0,
    scope: `${template.scope} Unmeasured until supported by coordinated drawing, schedule or specification evidence.`,
    evidence: pending,
    status: "UNMEASURED",
    section,
    tradeCode: template.code,
    sortOrder: start + index,
  }));

export const preliminariesRows = () =>
  makeRows(
    preliminaries,
    "PRELIMINARIES",
    "Project preliminaries",
    "PRELIM",
    0,
  );

export const externalRows = () =>
  makeRows(
    external,
    "EXTERNAL",
    "External works and envelope",
    "EXTERNAL",
    100,
  );

export const roomScopeRows = (rooms: string[]) =>
  rooms.flatMap((room, roomIndex) => {
    const lower = room.toLowerCase();
    const additions = [
      ...(/kitchen/.test(lower) ? kitchen : []),
      ...(/bath|shower|ensuite|en-suite|\bwc\b|cloakroom/.test(lower)
        ? wetRoom
        : []),
      ...(/utility|laundry/.test(lower) ? utility : []),
      ...(/hall|landing|stair/.test(lower) ? circulation : []),
    ];
    return makeRows(
      [...roomCommon, ...additions],
      "ROOM",
      room,
      `ROOM-${slug(room)}`,
      1000 + roomIndex * 100,
    );
  });

export const seedBoqRows = () => [...preliminariesRows(), ...externalRows()];

export const sectionRank = (section?: BoqSection) =>
  section === "PRELIMINARIES" ? 0 : section === "EXTERNAL" ? 1 : 2;

export const sortBoqRows = <
  T extends Pick<BoqScopeRow, "room" | "item"> &
    Partial<Pick<BoqScopeRow, "section" | "sortOrder">>,
>(
  rows: T[],
) =>
  [...rows].sort(
    (a, b) =>
      sectionRank(a.section) - sectionRank(b.section) ||
      (a.sortOrder ?? 99999) - (b.sortOrder ?? 99999) ||
      a.room.localeCompare(b.room, undefined, { numeric: true }) ||
      a.item.localeCompare(b.item),
  );

export const canonicalRoomInstances = <
  T extends { text: string; x: number; y: number },
>(
  labels: T[],
): T[] => {
  const groups = new Map<string, T[]>();
  labels.forEach((label) => {
    const key = label.text.trim().replace(/\s+/g, " ").toLowerCase();
    groups.set(key, [...(groups.get(key) || []), label]);
  });
  const numbered = new Map<T, string>();
  groups.forEach((members) => {
    if (members.length < 2) return;
    [...members]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .forEach((member, index) =>
        numbered.set(member, `${member.text.trim()} ${index + 1}`),
      );
  });
  return labels.map((label) => ({
    ...label,
    text: numbered.get(label) || label.text.trim().replace(/\s+/g, " "),
  }));
};
