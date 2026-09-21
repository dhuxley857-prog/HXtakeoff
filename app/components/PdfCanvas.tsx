"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  validateCalibration,
  type CalibrationEvidence,
} from "../../lib/takeoff/calibration";
import { extractPdfLineSegments } from "../../lib/takeoff/pdfVectors";
import { explicitRepeatedStoreyHeight } from "../../lib/takeoff/dimensions";
import {
  parseOpeningSchedules,
  reconcileOpening,
  roomsMatch,
  rowsFromPositionedText,
  type OpeningScheduleRow,
} from "../../lib/takeoff/schedules";
import {
  bridgeCollinearGaps,
  buildClosedTopology,
  netFacadeArea,
  netPerimeter,
  netWallArea,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  selectRoomPolygon,
  type Segment,
  type TopologyPolygon,
} from "../../lib/takeoff/topology";

type PageKind =
  "PLAN" | "ELEVATION" | "SECTION" | "DETAIL" | "SCHEDULE" | "MEP" | "OTHER";
type Hit = { page: number; kind: PageKind; title: string };
type Label = { text: string; x: number; y: number };
type Dimension = Label & { mm: number };
type Vector = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  source?: string;
};
type Tool =
  | "inspect"
  | "calibrate"
  | "room"
  | "facade"
  | "opening"
  | "gifa"
  | "area"
  | "length"
  | "count";
export type EvidenceMarkup = {
  ref: string;
  document?: string;
  page: number;
  kind: "room" | "facade" | "opening" | "gifa" | "work";
  points: { x: number; y: number }[];
  label: string;
  quantity: number;
  unit: "m²" | "m" | "nr";
};

export type SourceDocument = { name: string; url: string; revision?: string };
export type PackManifest = {
  documents: {
    name: string;
    pages: number;
    fingerprint: string;
    sheets: {
      page: number;
      kind: PageKind;
      title: string;
      fingerprint: string;
      dimensions: number[];
      openingRefs: string[];
      roomLabels: string[];
      clauseFingerprint: string;
    }[];
  }[];
  openingRows: OpeningScheduleRow[];
};
export type BoqDraft = {
  id: string;
  page: number;
  room: string;
  item: string;
  unit: "m²" | "m" | "nr" | "m³" | "item";
  qty: number;
  scope: string;
  evidence: string;
  status: "REVIEW" | "UNMEASURED";
  sourcePages?: number[];
  markupRef?: string;
};

const ROOM =
  /^(sitting room|living room|living|kitchen(?:\s*\/\s*dining)?|kitchen|dining room|dining|hall|bedroom(?:\s+\d+)?|master bedroom|bathroom|bath|wc|utility(?: room)?|study|garage|landing|ensuite|store)$/i;
const DOOR = /^(d\s*\d+[a-z]?|door\s*\d+[a-z]?)$/i;
const WINDOW = /^(w\s*\d+[a-z]?|window\s*\d+[a-z]?)$/i;
const DIM = /^(?:\d{3,5}|\d{3,5}\s*mm)$/i;
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const classify = (text: string): PageKind => {
  const t = text.toLowerCase();
  if (/window schedule|door schedule|schedules/.test(t)) return "SCHEDULE";
  if (/mep|heating layout|plumbing|electrical/.test(t)) return "MEP";
  if (/front elevation|rear elevation|side elevation|elevations/.test(t))
    return "ELEVATION";
  if (/ground floor plan|first floor plan|floor plan/.test(t)) return "PLAN";
  if (/section\s+[a-z]-[a-z]/.test(t)) return "SECTION";
  if (/detail/.test(t)) return "DETAIL";
  return "OTHER";
};
const titleFor = (text: string, page: number, kind: PageKind) =>
  text
    .match(
      /\b(?:GROUND FLOOR PLAN|FIRST FLOOR PLAN|ROOF PLAN|ELEVATIONS?|SCHEDULES?|SECTION\s+[A-Z]-[A-Z])\b/i,
    )?.[0]
    ?.replace(/\s+/g, " ") || `${kind} · P${page}`;
const px = (p: { x: number; y: number }, size: { w: number; h: number }) => ({
  x: (p.x / 100) * size.w,
  y: (p.y / 100) * size.h,
});
const metricArea = (
  points: { x: number; y: number }[],
  size: { w: number; h: number },
  scale: number,
) => (polygonArea(points.map((p) => px(p, size))) * scale * scale) / 1e6;
const metricPerimeter = (
  points: { x: number; y: number }[],
  size: { w: number; h: number },
  scale: number,
) => (polygonPerimeter(points.map((p) => px(p, size))) * scale) / 1000;
const metricPolyline = (
  points: { x: number; y: number }[],
  size: { w: number; h: number },
  scale: number,
) => {
  const converted = points.map((p) => px(p, size));
  let length = 0;
  for (let i = 1; i < converted.length; i++)
    length += Math.hypot(
      converted[i].x - converted[i - 1].x,
      converted[i].y - converted[i - 1].y,
    );
  return (length * scale) / 1000;
};
const WORK_ITEMS: { label: string; unit: "m²" | "m" | "nr"; rx: RegExp }[] = [
  {
    label: "Foundation centreline / trench route",
    unit: "m",
    rx: /foundation|footing/i,
  },
  {
    label: "Excavation footprint",
    unit: "m²",
    rx: /excavat|earthwork/i,
  },
  {
    label: "Ground-floor build-up",
    unit: "m²",
    rx: /ground floor|slab|dpm|membrane/i,
  },
  {
    label: "External wall construction",
    unit: "m²",
    rx: /external wall|brick|stone|render|cladding/i,
  },
  {
    label: "Facing brickwork façade zone",
    unit: "m²",
    rx: /facing brick|brickwork/i,
  },
  {
    label: "Facing stonework façade zone",
    unit: "m²",
    rx: /facing stone|stonework/i,
  },
  {
    label: "Rendered façade zone",
    unit: "m²",
    rx: /render/i,
  },
  {
    label: "Cladding façade zone",
    unit: "m²",
    rx: /cladding/i,
  },
  {
    label: "Internal partition centreline",
    unit: "m",
    rx: /partition|stud wall|blockwork/i,
  },
  {
    label: "Roof covering / insulation",
    unit: "m²",
    rx: /roof|tile|insulation/i,
  },
  {
    label: "Roof edges / eaves / verges",
    unit: "m",
    rx: /eaves|verge|fascia|soffit/i,
  },
  {
    label: "Below-ground drainage route",
    unit: "m",
    rx: /drain|soil pipe/i,
  },
  {
    label: "Rainwater goods route",
    unit: "m",
    rx: /rainwater|rwp|gutter/i,
  },
  {
    label: "Measurable MEP point",
    unit: "nr",
    rx: /electrical|socket|light|extract|radiator|plumb/i,
  },
];

export default function PdfCanvas({
  url,
  sources,
  onBoq,
  onManifest,
  onGifa,
  focusMarkup,
  readOnly = false,
  markups: controlledMarkups,
  onMarkups,
}: {
  url?: string;
  sources?: SourceDocument[];
  onBoq?: (row: BoqDraft) => void;
  onManifest?: (manifest: PackManifest) => void;
  onGifa?: (floor: string, area: number, evidence: string) => void;
  focusMarkup?: string;
  readOnly?: boolean;
  markups?: EvidenceMarkup[];
  onMarkups?: Dispatch<SetStateAction<EvidenceMarkup[]>>;
}) {
  const docs = useMemo(
    () =>
      sources?.length
        ? sources
        : url
          ? [{ name: "DH415BB-3 Construction Drawing Pack", url }]
          : [],
    [sources, url],
  );
  const canvas = useRef<HTMLCanvasElement>(null),
    pdfRef = useRef<any>(null),
    touchStart = useRef<number | null>(null);
  const [docIndex, setDocIndex] = useState(0),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [pageKind, setPageKind] = useState<PageKind>("OTHER");
  const [sheetHits, setSheetHits] = useState<Hit[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [vectors, setVectors] = useState<Vector[]>([]),
    [labels, setLabels] = useState<Label[]>([]),
    [dimensions, setDimensions] = useState<Dimension[]>([]),
    [doorRefs, setDoorRefs] = useState<Label[]>([]),
    [windowRefs, setWindowRefs] = useState<Label[]>([]);
  const [schedule, setSchedule] = useState<OpeningScheduleRow[]>([]),
    [scopeLines, setScopeLines] = useState<
      { document: string; page: number; text: string }[]
    >([]);
  const [autoScale, setAutoScale] = useState<number | null>(null),
    [autoCalibration, setAutoCalibration] = useState<ReturnType<
      typeof validateCalibration
    > | null>(null),
    [manualEvidence, setManualEvidence] = useState<CalibrationEvidence[]>([]);
  const [selectedDimIndex, setSelectedDimIndex] = useState<number | null>(null),
    [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]),
    [tool, setTool] = useState<Tool>("inspect"),
    [trace, setTrace] = useState<{ x: number; y: number }[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Label | null>(null),
    [heightMm, setHeightMm] = useState<number | null>(null),
    [topologyNote, setTopologyNote] = useState("");
  const [localMarkups, setLocalMarkups] = useState<EvidenceMarkup[]>([]),
    markups = controlledMarkups ?? localMarkups,
    setMarkups = onMarkups ?? setLocalMarkups;
  const [facadeGross, setFacadeGross] = useState<number | null>(null),
    [openingAreas, setOpeningAreas] = useState<
      {
        area: number;
        ref: string;
        tag: string;
        schedule: OpeningScheduleRow | null;
        scheduledArea: number | null;
        variancePct: number | null;
      }[]
    >([]),
    [selectedOpeningTag, setSelectedOpeningTag] = useState("");
  const [workItem, setWorkItem] = useState(WORK_ITEMS[0].label);
  const manualCalibration = validateCalibration(manualEvidence),
    activeScale = manualCalibration.valid
      ? manualCalibration.mmPerUnit
      : autoScale,
    currentDoc = docs[docIndex];

  useEffect(() => {
    if (!focusMarkup) return;
    const documentMatch = focusMarkup.match(/^D(\d+)-/),
      pageMatch = focusMarkup.match(/P(\d{2})-/);
    if (documentMatch) setDocIndex(Number(documentMatch[1]) - 1);
    if (pageMatch) setPage(Number(pageMatch[1]));
  }, [focusMarkup]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentDoc) return;
      setBusy(true);
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const openings: OpeningScheduleRow[] = [],
          scopes: { document: string; page: number; text: string }[] = [],
          manifests: PackManifest["documents"] = [];
        let activeHits: Hit[] = [],
          activePdf: any = null;
        for (let d = 0; d < docs.length; d++) {
          const source = docs[d],
            pdf = await pdfjs.getDocument(source.url).promise,
            hits: Hit[] = [],
            sheets: PackManifest["documents"][number]["sheets"] = [];
          let fingerprint = "";
          for (let n = 1; n <= pdf.numPages; n++) {
            const pg = await pdf.getPage(n),
              tc = await pg.getTextContent(),
              vp = pg.getViewport({ scale: 1 });
            const items = (tc.items as any[])
              .filter((x) => x.str)
              .map((x) => {
                const p = vp.convertToViewportPoint(
                  x.transform[4],
                  x.transform[5],
                );
                return { text: String(x.str).trim(), x: p[0], y: p[1] };
              });
            const text = items.map((x) => x.text).join(" "),
              kind = classify(text),
              title = titleFor(text, n, kind);
            fingerprint += hash(text.replace(/\s+/g, " "));
            const normalized = text.replace(/\s+/g, " "),
              sheetDimensions = Array.from(
                new Set(
                  (normalized.match(/\b\d{3,5}(?=\s*(?:mm\b|x|×|$))/gi) || [])
                    .map((v) => Number(v))
                    .filter((v) => v >= 300 && v <= 30000),
                ),
              ).sort((a, b) => a - b),
              openingRefs = Array.from(
                new Set(
                  (normalized.match(/\b[DW]\s*\d+[A-Z]?\b/gi) || []).map((v) =>
                    v.toUpperCase().replace(/\s+/g, ""),
                  ),
                ),
              ).sort(),
              roomLabels = Array.from(
                new Set(
                  items
                    .map((item) => item.text.trim())
                    .filter((value) => ROOM.test(value))
                    .map((value) => value.replace(/\s+/g, " ")),
                ),
              ).sort(),
              clauses = normalized
                .split(/(?<=[.;:])\s+/)
                .filter((s) =>
                  /(brick|stone|render|cladding|wall|partition|floor|ceiling|skirting|tile|roof|insulation|drain|rainwater|heating|plumbing|electrical)/i.test(
                    s,
                  ),
                )
                .join("|");
            sheets.push({
              page: n,
              kind,
              title,
              fingerprint: hash(normalized),
              dimensions: sheetDimensions,
              openingRefs,
              roomLabels,
              clauseFingerprint: hash(clauses),
            });
            if (kind !== "OTHER") hits.push({ page: n, kind, title });
            if (kind === "SCHEDULE")
              openings.push(
                ...parseOpeningSchedules(rowsFromPositionedText(items), n).map(
                  (row) => ({ ...row, document: source.name }),
                ),
              );
            text
              .split(/(?<=[.;:])\s+/)
              .filter(
                (s) =>
                  /(brick|stone|render|cladding|wall|partition|floor|ceiling|skirting|tile|roof|insulation|drain|rainwater|heating|plumbing|electrical)/i.test(
                    s,
                  ) &&
                  s.length > 14 &&
                  s.length < 320,
              )
              .slice(0, 20)
              .forEach((s) =>
                scopes.push({
                  document: source.name,
                  page: n,
                  text: s.trim(),
                }),
              );
          }
          manifests.push({
            name: source.name,
            pages: pdf.numPages,
            fingerprint: hash(fingerprint),
            sheets,
          });
          if (d === docIndex) {
            activePdf = pdf;
            activeHits = hits;
          }
        }
        if (cancelled) return;
        pdfRef.current = activePdf;
        setPages(activePdf.numPages);
        setSheetHits(activeHits);
        setSchedule(openings);
        setScopeLines(scopes);
        onManifest?.({ documents: manifests, openingRows: openings });
        setPage(activeHits.find((h) => h.kind === "PLAN")?.page || 1);
      } catch (e: any) {
        setError(e?.message || "Could not index document pack");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docs, docIndex, currentDoc]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = pdfRef.current;
      if (!pdf) return;
      setBusy(true);
      try {
        const pdfjs = await import("pdfjs-dist"),
          pg = await pdf.getPage(page),
          tc = await pg.getTextContent(),
          base = pg.getViewport({ scale: 1 }),
          text = (tc.items as any[]).map((x) => String(x.str || "")).join(" ");
        setPageKind(classify(text));
        setPageSize({ w: base.width, h: base.height });
        const op = await pg.getOperatorList();
        const lines = extractPdfLineSegments(
          op.fnArray,
          op.argsArray,
          pdfjs.OPS,
          (x, y) => base.convertToViewportPoint(x, y),
        )
          .map((s) => ({
            x1: (s.a.x / base.width) * 100,
            y1: (s.a.y / base.height) * 100,
            x2: (s.b.x / base.width) * 100,
            y2: (s.b.y / base.height) * 100,
            source: s.source,
          }))
          .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.2);
        if (cancelled) return;
        setVectors(lines);
        const positioned = (pattern: RegExp) =>
          (tc.items as any[])
            .filter((x) => x.str && pattern.test(String(x.str).trim()))
            .map((x) => {
              const p = base.convertToViewportPoint(
                x.transform[4],
                x.transform[5],
              );
              return {
                text: String(x.str).trim(),
                x: (p[0] / base.width) * 100,
                y: (p[1] / base.height) * 100,
              };
            });
        setLabels(positioned(ROOM));
        setDoorRefs(positioned(DOOR));
        setWindowRefs(positioned(WINDOW));
        const dims = positioned(DIM)
          .map((x) => ({ ...x, mm: Number(x.text.replace(/\D/g, "")) }))
          .filter((x) => x.mm >= 300 && x.mm <= 30000);
        setDimensions(dims);
        setHeightMm(explicitRepeatedStoreyHeight(text));
        const host = canvas.current?.parentElement,
          renderScale = Math.max(
            0.5,
            Math.min(2, (host?.clientWidth || 900) / base.width),
          ),
          vp = pg.getViewport({ scale: renderScale }),
          el = canvas.current;
        if (!el) return;
        const dpr = window.devicePixelRatio || 1;
        el.width = Math.floor(vp.width * dpr);
        el.height = Math.floor(vp.height * dpr);
        el.style.width = vp.width + "px";
        el.style.height = vp.height + "px";
        const ctx = el.getContext("2d");
        if (ctx)
          await pg.render({
            canvas: el,
            canvasContext: ctx,
            viewport: vp,
            transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
          }).promise;
        const raw: { row: Dimension; scale: number; length: number }[] = [];
        for (const d of dims) {
          lines
            .map((s) => {
              const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 },
                length = Math.hypot(
                  ((s.x2 - s.x1) / 100) * base.width,
                  ((s.y2 - s.y1) / 100) * base.height,
                );
              return { length, distance: Math.hypot(mid.x - d.x, mid.y - d.y) };
            })
            .filter((x) => x.distance < 10 && x.length > 8)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 8)
            .forEach((x) => {
              const scale = d.mm / x.length;
              if (scale > 0.1 && scale < 100)
                raw.push({ row: d, scale, length: x.length });
            });
        }
        if (raw.length) {
          const sorted = raw.map((x) => x.scale).sort((a, b) => a - b),
            rough = sorted[Math.floor(sorted.length / 2)],
            unique = dims
              .map((d, i) => {
                const best = raw
                  .filter((x) => x.row === d)
                  .sort(
                    (a, b) =>
                      Math.abs(a.scale - rough) - Math.abs(b.scale - rough),
                  )[0];
                return best
                  ? {
                      id: `P${page}-D${i + 1}-${d.mm}`,
                      figuredMm: d.mm,
                      drawnLength: best.length,
                      page,
                      drawing: currentDoc.name,
                    }
                  : null;
              })
              .filter(Boolean) as CalibrationEvidence[],
            result = validateCalibration(unique, 1.5);
          setAutoCalibration(result);
          setAutoScale(result.valid ? result.mmPerUnit : null);
        } else {
          setAutoCalibration(null);
          setAutoScale(null);
        }
      } catch (e: any) {
        setError(e?.message || "Could not render drawing");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, currentDoc?.url]);
  useEffect(() => {
    setFacadeGross(null);
    setOpeningAreas([]);
    setSelectedOpeningTag("");
  }, [page, currentDoc?.url]);

  const currentScale = activeScale || 0,
    quantity =
      pageSize && currentScale && trace.length >= 3
        ? metricArea(trace, pageSize, currentScale)
        : 0,
    tracePerimeter =
      pageSize && currentScale && trace.length >= 3
        ? metricPerimeter(trace, pageSize, currentScale)
        : 0,
    traceLength =
      pageSize && currentScale && trace.length >= 2
        ? metricPolyline(trace, pageSize, currentScale)
        : 0;
  const scopeFor = (rx: RegExp) =>
    scopeLines.filter((s) => rx.test(s.text)).slice(0, 3);
  const addMarkup = (
    kind: EvidenceMarkup["kind"],
    points: { x: number; y: number }[],
    label: string,
    q: number,
    unit: EvidenceMarkup["unit"] = "m²",
  ) => {
    const prefix =
        kind === "room"
          ? "A"
          : kind === "facade"
            ? "F"
            : kind === "opening"
              ? "O"
              : kind === "gifa"
                ? "G"
                : "M",
      ref = `${docs.length > 1 ? `D${docIndex + 1}-` : ""}P${String(page).padStart(2, "0")}-${prefix}${String(markups.filter((m) => m.page === page && m.kind === kind && (!m.document || m.document === currentDoc.name)).length + 1).padStart(2, "0")}`;
    setMarkups((v) => [
      ...v,
      {
        ref,
        document: currentDoc.name,
        page,
        kind,
        points,
        label,
        quantity: q,
        unit,
      },
    ]);
    return ref;
  };
  const evidenceBase = (ref: string) =>
    `${ref} · ${currentDoc.name} · P${page} · ${manualCalibration.valid ? "two-point reviewed calibration" : `${autoCalibration?.accepted.length || 0} independently agreeing figured dimensions`} · ${currentScale.toFixed(3)} mm/PDF pt`;
  const candidateForRoom = (room: Label) => {
    if (!pageSize || !currentScale) return null;
    const styled = vectors.filter((v) => /width=(18|24);/.test(v.source || "")),
      sourceVectors = styled.length > 40 ? styled : vectors,
      axis = sourceVectors
        .map(
          (v) =>
            ({ a: { x: v.x1, y: v.y1 }, b: { x: v.x2, y: v.y2 } }) as Segment,
        )
        .filter((s) => {
          const dx = Math.abs(s.b.x - s.a.x),
            dy = Math.abs(s.b.y - s.a.y),
            len = Math.hypot(dx, dy),
            inside =
              Math.max(s.a.x, s.b.x) > room.x - 18 &&
              Math.min(s.a.x, s.b.x) < room.x + 18 &&
              Math.max(s.a.y, s.b.y) > room.y - 18 &&
              Math.min(s.a.y, s.b.y) < room.y + 18;
          return inside && len > 0.6 && len < 30 && (dx < 0.12 || dy < 0.12);
        });
    const faces = buildClosedTopology(
        bridgeCollinearGaps(axis, { axisTolerance: 0.15, maxGap: 9 }),
        { snapTolerance: 0.12, minArea: 0.04, maxArea: 1200 },
      ),
      polygon = selectRoomPolygon(faces, room, { minArea: 0.2, maxArea: 1000 });
    if (!polygon) return null;
    const enclosedLabels = labels.filter((label) =>
        pointInPolygon(label, polygon.points),
      ),
      openPlanPair =
        enclosedLabels.length === 2 &&
        enclosedLabels.every((label) => /kitchen|dining/i.test(label.text)),
      area = metricArea(polygon.points, pageSize, currentScale),
      perimeter = metricPerimeter(polygon.points, pageSize, currentScale),
      compactness = area > 0 ? (perimeter * perimeter) / area : Infinity;
    if (
      area < 2.5 ||
      area > 100 ||
      polygon.points.length > 16 ||
      compactness > 45 ||
      (enclosedLabels.length > 1 && !openPlanPair)
    )
      return null;
    return polygon.points;
  };
  const runTopology = (room: Label) => {
    if (readOnly) return;
    setSelectedRoom(room);
    setTrace([]);
    if (!pageSize || !currentScale) {
      setTopologyNote(
        "Calibration must be validated before topology can produce a metric quantity.",
      );
      return;
    }
    const points = candidateForRoom(room);
    if (!points) {
      setTopologyNote(
        "No defensible closed face passed the room area/shape gates. Trace the visible wall face; HX will not substitute a rectangle.",
      );
      setTool("room");
      return;
    }
    setTrace(points);
    setTopologyNote(
      `${points.length}-vertex closed face found. Review the highlighted topology before adding quantities.`,
    );
    setTool("room");
  };
  const emitRoomBoq = (
    room: Label,
    points: { x: number; y: number }[],
    ref: string,
  ) => {
    if (!pageSize || !currentScale || points.length < 3) return;
    const area = metricArea(points, pageSize, currentScale),
      perimeter = metricPerimeter(points, pageSize, currentScale),
      roomRows = schedule.filter((r) => roomsMatch(r.room, room.text)),
      doors = roomRows.filter((r) => r.kind === "door"),
      windows = roomRows.filter((r) => r.kind === "window"),
      openings = [
        ...doors.map((d) => ({ width: d.widthMm / 1000, height: 2.1 })),
        ...windows
          .filter((w) => w.heightMm)
          .map((w) => ({
            width: w.widthMm / 1000,
            height: w.heightMm! / 1000,
          })),
      ],
      base = evidenceBase(ref),
      scope = scopeFor(/floor|tile|timber|vinyl|carpet/i),
      specRefs = scope
        .map((s) => `${s.document} P${s.page}`)
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(", "),
      scheduleRefs = roomRows
        .map((r) => `${r.tag} → ${r.document || "Schedule"} P${r.page}`)
        .join(", "),
      rows: BoqDraft[] = [
        {
          id: `${ref}-FLOOR`,
          page,
          room: room.text,
          item: "Floor area / finish",
          unit: "m²",
          qty: Number(area.toFixed(2)),
          scope: scope.length
            ? scope.map((s) => s.text).join(" | ")
            : "Measured floor area; finish specification not explicitly resolved.",
          sourcePages: scope.map((s) => s.page),
          evidence: `${base} · closed ${points.length}-vertex topology${specRefs ? ` · specification ${specRefs}` : ""}`,
          markupRef: ref,
          status: "REVIEW",
        },
        {
          id: `${ref}-CEILING`,
          page,
          room: room.text,
          item: "Ceiling area / finish",
          unit: "m²",
          qty: Number(area.toFixed(2)),
          scope:
            "Ceiling plan footprint matched to reviewed room topology; finish requires specification review.",
          evidence: `${base} · same horizontal room topology`,
          markupRef: ref,
          status: "REVIEW",
        },
        {
          id: `${ref}-SKIRT`,
          page,
          room: room.text,
          item: "Skirting net of scheduled door openings",
          unit: "m",
          qty: Number(
            netPerimeter(
              perimeter,
              doors.map((d) => d.widthMm / 1000),
            ).toFixed(2),
          ),
          scope: `Gross perimeter ${perimeter.toFixed(2)} m less scheduled openings: ${doors.map((d) => `${d.tag} ${d.widthMm}mm`).join(", ") || "none resolved"}.`,
          sourcePages: [...new Set(doors.map((d) => d.page))],
          evidence: `${base} · schedule deductions${scheduleRefs ? ` · ${scheduleRefs}` : " · no matched schedule rows"}`,
          markupRef: ref,
          status: "REVIEW",
        },
      ];
    if (heightMm)
      rows.push({
        id: `${ref}-WALL`,
        page,
        room: room.text,
        item: "Internal wall finish / decoration net of openings",
        unit: "m²",
        qty: Number(
          netWallArea(perimeter, heightMm / 1000, openings).toFixed(2),
        ),
        scope: `Perimeter × independently repeated ${heightMm}mm height less ${doors.length} door and ${windows.length} window schedule opening(s).`,
        sourcePages: [...new Set(roomRows.map((r) => r.page))],
        evidence: `${base} · repeated figured height ${heightMm}mm · schedule deductions${scheduleRefs ? ` · ${scheduleRefs}` : " · no matched schedule rows"}`,
        markupRef: ref,
        status: "REVIEW",
      });
    else
      rows.push({
        id: `${ref}-WALL`,
        page,
        room: room.text,
        item: "Internal wall finish / decoration",
        unit: "m²",
        qty: 0,
        scope:
          "Unmeasured: no independently repeated storey-height dimension resolved.",
        evidence: `${base} · height evidence unresolved`,
        markupRef: ref,
        status: "UNMEASURED",
      });
    rows.forEach((r) => onBoq?.(r));
  };
  const buildRoom = () => {
    if (
      !selectedRoom ||
      !pageSize ||
      !currentScale ||
      trace.length < 3 ||
      quantity <= 0
    )
      return;
    const ref = addMarkup("room", trace, selectedRoom.text, quantity);
    emitRoomBoq(selectedRoom, trace, ref);
    setTool("inspect");
    setTrace([]);
  };
  const autoMeasureRooms = () => {
    if (readOnly || !pageSize || !currentScale) return;
    const existing = new Set(
        markups
          .filter(
            (markup) =>
              markup.page === page &&
              markup.kind === "room" &&
              (!markup.document || markup.document === currentDoc.name),
          )
          .map((markup) => markup.label.toLowerCase()),
      ),
      seenPolygons = new Set<string>(),
      additions: EvidenceMarkup[] = [];
    let next =
      markups.filter(
        (markup) =>
          markup.page === page &&
          markup.kind === "room" &&
          (!markup.document || markup.document === currentDoc.name),
      ).length + 1;
    for (const room of labels) {
      if (existing.has(room.text.toLowerCase())) continue;
      const points = candidateForRoom(room);
      if (!points) continue;
      const polygonKey = points
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .sort()
        .join("|");
      if (seenPolygons.has(polygonKey)) continue;
      seenPolygons.add(polygonKey);
      const area = metricArea(points, pageSize, currentScale),
        ref = `${docs.length > 1 ? `D${docIndex + 1}-` : ""}P${String(page).padStart(2, "0")}-A${String(next++).padStart(2, "0")}`;
      additions.push({
        ref,
        document: currentDoc.name,
        page,
        kind: "room",
        points,
        label: room.text,
        quantity: area,
        unit: "m²",
      });
      emitRoomBoq(room, points, ref);
    }
    if (additions.length) setMarkups((value) => [...value, ...additions]);
    setTopologyNote(
      additions.length
        ? `${additions.length} room topolog${additions.length === 1 ? "y" : "ies"} passed calibration, closure, area, shape and label-isolation gates. Review each BOQ line before approval.`
        : "No additional room topology passed every evidence gate. Unsupported rooms remain unmeasured for manual tracing.",
    );
    setTool("inspect");
    setTrace([]);
  };
  const finishFacade = () => {
    if (!pageSize || !currentScale || trace.length < 3) return;
    if (tool === "facade") {
      setFacadeGross(quantity);
      const ref = addMarkup("facade", trace, "Gross façade", quantity);
      setTopologyNote(
        `${ref} gross façade recorded. Trace each opening before adding the net façade.`,
      );
    } else {
      const centre = trace.reduce(
          (point, vertex) => ({
            x: point.x + vertex.x / trace.length,
            y: point.y + vertex.y / trace.length,
          }),
          { x: 0, y: 0 },
        ),
        nearest = [...doorRefs, ...windowRefs]
          .map((label) => ({
            label,
            distance: Math.hypot(label.x - centre.x, label.y - centre.y),
          }))
          .sort((a, b) => a.distance - b.distance)[0],
        tag =
          selectedOpeningTag ||
          (nearest?.distance < 12
            ? nearest.label.text.toUpperCase().replace(/\s+/g, "")
            : ""),
        row = tag ? reconcileOpening(tag, schedule) : null,
        scheduledArea =
          row?.heightMm && row.widthMm
            ? (row.widthMm * row.heightMm) / 1_000_000
            : null,
        variancePct = scheduledArea
          ? (Math.abs(quantity - scheduledArea) / scheduledArea) * 100
          : null,
        ref = addMarkup(
          "opening",
          trace,
          tag || `Unresolved opening ${openingAreas.length + 1}`,
          quantity,
        );
      setOpeningAreas((value) => [
        ...value,
        { area: quantity, ref, tag, schedule: row, scheduledArea, variancePct },
      ]);
      setTopologyNote(
        row
          ? `${ref} reconciled ${row.tag} to ${row.document || "schedule"} P${row.page} and ${row.room}${variancePct === null ? "" : ` · traced ${quantity.toFixed(2)} m² vs scheduled ${scheduledArea!.toFixed(2)} m² · ${variancePct.toFixed(1)}% variance${variancePct > 10 ? " · REVIEW REQUIRED" : ""}`}.`
          : `${ref} retained as a measured opening${tag ? ` tagged ${tag}` : " without a resolved tag"}; schedule coordination remains flagged.`,
      );
      setSelectedOpeningTag("");
    }
    setTrace([]);
  };
  const addFacadeBoq = () => {
    if (!facadeGross) return;
    const net = netFacadeArea(
        facadeGross,
        openingAreas.map((opening) => ({
          width: opening.area,
          height: 1,
        })),
      ),
      facade = markups
        .filter(
          (m) =>
            m.page === page &&
            m.kind === "facade" &&
            (!m.document || m.document === currentDoc.name),
        )
        .at(-1),
      scope = scopeFor(/brick|stone|render|cladding|external wall/i),
      specRefs = scope
        .map((s) => `${s.document} P${s.page}`)
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(", "),
      ref =
        facade?.ref ||
        `${docs.length > 1 ? `D${docIndex + 1}-` : ""}P${String(page).padStart(2, "0")}-F01`;
    [
      {
        id: `${ref}-GROSS`,
        item: "External façade gross area",
        qty: facadeGross,
        scope: "Gross marked elevation area.",
      },
      {
        id: `${ref}-NET`,
        item: "External façade net area",
        qty: net,
        scope: `Gross façade less ${openingAreas.length} marked opening polygon(s).`,
      },
    ].forEach((r) =>
      onBoq?.({
        ...r,
        page,
        room: "Elevation",
        unit: "m²",
        sourcePages: [
          ...new Set([
            ...scope.map((s) => s.page),
            ...openingAreas.flatMap((opening) =>
              opening.schedule ? [opening.schedule.page] : [],
            ),
          ]),
        ],
        evidence: `${evidenceBase(ref)} · deductions ${openingAreas.map((opening) => `${opening.ref}${opening.tag ? ` ${opening.tag}` : " untagged"}${opening.schedule ? ` → ${opening.schedule.document || "Schedule"} P${opening.schedule.page} → ${opening.schedule.room}` : " → schedule unresolved"}${opening.scheduledArea ? ` → traced ${opening.area.toFixed(2)} m² / scheduled ${opening.scheduledArea.toFixed(2)} m² / ${opening.variancePct!.toFixed(1)}% variance${opening.variancePct! > 10 ? " REVIEW" : ""}` : ""}`).join(", ") || "none"}${specRefs ? ` · specification ${specRefs}` : ""}`,
        markupRef: ref,
        status: "REVIEW",
      }),
    );
  };
  const finishGifa = () => {
    if (!pageSize || !currentScale || trace.length < 3) return;
    const floor =
        sheetHits.find((h) => h.page === page)?.title || `Floor P${page}`,
      ref = addMarkup("gifa", trace, `${floor} external face`, quantity);
    onGifa?.(floor, Number(quantity.toFixed(2)), evidenceBase(ref));
    onBoq?.({
      id: `${ref}-GIFA`,
      page,
      room: floor,
      item: "GIFA external-face floor polygon",
      unit: "m²",
      qty: Number(quantity.toFixed(2)),
      scope:
        "External-face polygon measured separately from room finishes for NRM1 analysis.",
      evidence: evidenceBase(ref),
      markupRef: ref,
      status: "REVIEW",
    });
    setTrace([]);
    setTool("inspect");
  };
  const finishWork = () => {
    if (!pageSize || !currentScale) return;
    const item = WORK_ITEMS.find((x) => x.label === workItem)!;
    const valid =
      item.unit === "nr"
        ? trace.length > 0
        : item.unit === "m"
          ? trace.length > 1
          : trace.length > 2;
    if (!valid) return;
    const measured =
        item.unit === "nr"
          ? trace.length
          : item.unit === "m"
            ? metricPolyline(trace, pageSize, currentScale)
            : metricArea(trace, pageSize, currentScale),
      ref = addMarkup("work", trace, item.label, measured, item.unit),
      scope = scopeFor(item.rx),
      specRefs = scope
        .map((s) => `${s.document} P${s.page}`)
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(", ");
    onBoq?.({
      id: `${ref}-${item.label.replace(/\W+/g, "-").toUpperCase()}`,
      page,
      room: sheetHits.find((h) => h.page === page)?.title || `Drawing P${page}`,
      item: item.label,
      unit: item.unit,
      qty: Number(measured.toFixed(2)),
      scope: scope.length
        ? scope.map((s) => s.text).join(" | ")
        : "Measured geometry retained; construction build-up/specification remains unresolved.",
      sourcePages: scope.map((s) => s.page),
      evidence: `${evidenceBase(ref)} · ${item.unit === "nr" ? `${trace.length} marked points` : `${trace.length}-vertex ${item.unit === "m" ? "polyline" : "polygon"}`}${specRefs ? ` · specification ${specRefs}` : ""}`,
      markupRef: ref,
      status: "REVIEW",
    });
    setTrace([]);
    setTool("inspect");
  };
  const clickDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === "inspect" || readOnly) return;
    const r = e.currentTarget.getBoundingClientRect(),
      p = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
    const selectedDimension =
      selectedDimIndex === null ? null : dimensions[selectedDimIndex];
    if (tool === "calibrate" && selectedDimension) {
      const next = [...calPts, p];
      setCalPts(next);
      if (next.length === 2 && pageSize) {
        const a = px(next[0], pageSize),
          b = px(next[1], pageSize),
          evidenceId = `P${page}-D${selectedDimIndex! + 1}-${selectedDimension.mm}`;
        setManualEvidence((v) => [
          ...v.filter((x) => x.id !== evidenceId),
          {
            id: evidenceId,
            figuredMm: selectedDimension.mm,
            drawnLength: Math.hypot(b.x - a.x, b.y - a.y),
            page,
            drawing: currentDoc.name,
          },
        ]);
        setCalPts([]);
        setSelectedDimIndex(null);
      }
      return;
    }
    setTrace((v) => [...v, p]);
  };
  const shown = markups.filter(
    (m) => m.page === page && (!m.document || m.document === currentDoc.name),
  );
  return (
    <div className="pdf-workspace">
      <div className="pdf-toolbar">
        <select
          value={docIndex}
          onChange={(e) => {
            setDocIndex(Number(e.target.value));
            setPage(1);
          }}
        >
          {docs.map((d, i) => (
            <option key={d.name + i} value={i}>
              {d.name}
            </option>
          ))}
        </select>
        <button disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
          ‹
        </button>
        <span>
          P{page} / {pages} · {pageKind}
        </span>
        <button disabled={page >= pages} onClick={() => setPage((v) => v + 1)}>
          ›
        </button>
        <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
          {sheetHits.map((h) => (
            <option key={h.page} value={h.page}>
              P{h.page} · {h.title}
            </option>
          ))}
        </select>
        <button
          disabled={readOnly || pageKind !== "PLAN" || !activeScale}
          onClick={autoMeasureRooms}
          title="Batch only closed CAD faces that pass calibration and room sanity gates"
        >
          AUTO ROOMS
        </button>
        {(["inspect", "room", "facade", "opening", "gifa"] as Tool[]).map(
          (t) => (
            <button
              key={t}
              disabled={readOnly && t !== "inspect"}
              onClick={() => {
                setTool(t);
                setTrace([]);
              }}
              className={tool === t ? "active" : ""}
            >
              {t === "inspect" ? "REVIEW" : `TRACE ${t.toUpperCase()}`}
            </button>
          ),
        )}
        <select value={workItem} onChange={(e) => setWorkItem(e.target.value)}>
          {WORK_ITEMS.map((item) => (
            <option key={item.label} value={item.label}>
              {item.label}
            </option>
          ))}
        </select>
        {(["area", "length", "count"] as Tool[]).map((t) => (
          <button
            key={t}
            disabled={readOnly}
            onClick={() => {
              setTool(t);
              setTrace([]);
            }}
            className={tool === t ? "active" : ""}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <button onClick={() => setTrace([])}>CLEAR</button>
      </div>
      <div className="evidence-strip">
        {readOnly && <strong>LOCKED · START A NEW REVISION TO MEASURE</strong>}
        <strong>{activeScale ? "SCALE VALID" : "SCALE BLOCKED"}</strong>
        <span>
          {autoCalibration?.valid
            ? `${autoCalibration.accepted.length} independent figured dimensions · ${autoCalibration.spreadPct.toFixed(2)}% spread`
            : autoCalibration?.reason || "No independent calibration evidence"}
        </span>
        {activeScale && <span>{activeScale.toFixed(3)} mm/PDF pt</span>}
        <select
          value={selectedDimIndex ?? ""}
          onChange={(e) => {
            setSelectedDimIndex(
              e.target.value === "" ? null : Number(e.target.value),
            );
            setTool("calibrate");
            setCalPts([]);
          }}
        >
          <option value="">Manual check · choose dimension</option>
          {dimensions.slice(0, 50).map((d, i) => (
            <option key={i} value={i}>
              D{i + 1} · {d.mm}mm · P{page}
            </option>
          ))}
        </select>
        <span>{manualEvidence.length} manual evidence line(s)</span>
        {busy && <span>Reading drawing…</span>}
      </div>
      {topologyNote && <div className="topology-note">{topologyNote}</div>}
      <div
        className="drawing-stage"
        onClick={clickDrawing}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) < 60 || tool !== "inspect") return;
          if (dx < 0 && page < pages) setPage((v) => v + 1);
          if (dx > 0 && page > 1) setPage((v) => v - 1);
        }}
      >
        <canvas ref={canvas} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {shown.map((m) => (
            <g key={m.ref}>
              {m.unit === "m" ? (
                <polyline
                  points={m.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  className={`markup ${m.kind} ${focusMarkup === m.ref ? "focused" : ""}`}
                  fill="none"
                />
              ) : m.unit === "nr" ? (
                m.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r=".65"
                    className={`markup ${m.kind} ${focusMarkup === m.ref ? "focused" : ""}`}
                  />
                ))
              ) : (
                <polygon
                  points={m.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  className={`markup ${m.kind} ${focusMarkup === m.ref ? "focused" : ""}`}
                />
              )}
              <text
                x={m.points[0]?.x || 0}
                y={Math.max(1, (m.points[0]?.y || 0) - 0.8)}
              >
                {m.ref} · {m.quantity.toFixed(2)} {m.unit}
              </text>
            </g>
          ))}
          {trace.length > 1 && (
            <polygon
              points={trace.map((p) => `${p.x},${p.y}`).join(" ")}
              className="trace"
            />
          )}
          {trace.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r=".55" className="trace-point" />
          ))}
          {calPts.length === 2 && (
            <line
              x1={calPts[0].x}
              y1={calPts[0].y}
              x2={calPts[1].x}
              y2={calPts[1].y}
              className="cal-line"
            />
          )}
        </svg>
        {labels.map((l, i) => (
          <button
            key={i}
            disabled={readOnly}
            className={`room-label ${selectedRoom?.text === l.text ? "selected" : ""}`}
            style={{ left: l.x + "%", top: l.y + "%" }}
            onClick={(e) => {
              e.stopPropagation();
              runTopology(l);
            }}
          >
            {l.text}
          </button>
        ))}
        {doorRefs.map((d, i) => {
          const row = reconcileOpening(d.text, schedule);
          return (
            <span
              key={"d" + i}
              className="drawing-tag door"
              style={{ left: d.x + "%", top: d.y + "%" }}
              title={
                row
                  ? `${row.tag} · ${row.widthMm}mm · schedule P${row.page}`
                  : `${d.text} · schedule unresolved`
              }
            >
              {d.text}
            </span>
          );
        })}
        {windowRefs.map((d, i) => {
          const row = reconcileOpening(d.text, schedule);
          return (
            <span
              key={"w" + i}
              className="drawing-tag window"
              style={{ left: d.x + "%", top: d.y + "%" }}
              title={
                row
                  ? `${row.tag} · ${row.widthMm}×${row.heightMm}mm · schedule P${row.page}`
                  : `${d.text} · schedule unresolved`
              }
            >
              {d.text}
            </span>
          );
        })}
      </div>
      <div className="measurement-actions">
        <span>
          {trace.length} vertices
          {tool === "count"
            ? ` · ${trace.length} nr`
            : tool === "length" && traceLength > 0
              ? ` · ${traceLength.toFixed(2)} m`
              : quantity > 0
                ? ` · ${quantity.toFixed(2)} m² · ${tracePerimeter.toFixed(2)} m perimeter`
                : ""}
        </span>
        {tool === "opening" && (
          <select
            value={selectedOpeningTag}
            onChange={(event) => setSelectedOpeningTag(event.target.value)}
          >
            <option value="">Opening tag · nearest visible tag</option>
            {schedule.map((row) => (
              <option
                key={`${row.document}-${row.page}-${row.tag}`}
                value={row.tag}
              >
                {row.tag} · {row.room} · {row.widthMm}
                {row.heightMm ? `×${row.heightMm}` : ""}mm
              </option>
            ))}
          </select>
        )}
        {tool === "room" && selectedRoom && quantity > 0 && (
          <button onClick={buildRoom}>BUILD EVIDENCE-LINKED ROOM BOQ</button>
        )}
        {(tool === "facade" || tool === "opening") && quantity > 0 && (
          <button onClick={finishFacade}>
            {tool === "facade" ? "SAVE GROSS FACADE" : "SAVE OPENING DEDUCTION"}
          </button>
        )}
        {facadeGross && (
          <button onClick={addFacadeBoq}>ADD GROSS + NET FACADE TO BOQ</button>
        )}
        {facadeGross && (
          <span>{openingAreas.length} façade opening(s) retained</span>
        )}
        {tool === "gifa" && quantity > 0 && (
          <button onClick={finishGifa}>SAVE EXTERNAL-FACE GIFA</button>
        )}
        {(["area", "length", "count"] as Tool[]).includes(tool) &&
          ((tool === "count" && trace.length > 0) ||
            (tool === "length" && trace.length > 1) ||
            (tool === "area" && quantity > 0)) && (
            <button onClick={finishWork}>ADD MEASURED WORK TO BOQ</button>
          )}
        <span>
          {schedule.length} schedule openings indexed · {scopeLines.length}{" "}
          construction-information clauses indexed
        </span>
      </div>
      {error && <div className="pdf-error">{error}</div>}
    </div>
  );
}
