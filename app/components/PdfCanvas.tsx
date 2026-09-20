"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  validateCalibration,
  type CalibrationEvidence,
} from "../../lib/takeoff/calibration";
import { extractPdfLineSegments } from "../../lib/takeoff/pdfVectors";
import {
  parseOpeningSchedules,
  reconcileOpening,
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
type Markup = {
  ref: string;
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
  { label: "Foundations / substructure", unit: "m", rx: /foundation|footing/i },
  { label: "Excavation", unit: "m²", rx: /excavat|earthwork/i },
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
    label: "Internal partitions",
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
  { label: "Below-ground drainage", unit: "m", rx: /drain|soil pipe/i },
  { label: "Rainwater goods", unit: "m", rx: /rainwater|rwp|gutter/i },
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
}: {
  url?: string;
  sources?: SourceDocument[];
  onBoq?: (row: BoqDraft) => void;
  onManifest?: (manifest: PackManifest) => void;
  onGifa?: (floor: string, area: number, evidence: string) => void;
  focusMarkup?: string;
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
    [scopeLines, setScopeLines] = useState<{ page: number; text: string }[]>(
      [],
    );
  const [autoScale, setAutoScale] = useState<number | null>(null),
    [autoCalibration, setAutoCalibration] = useState<ReturnType<
      typeof validateCalibration
    > | null>(null),
    [manualEvidence, setManualEvidence] = useState<CalibrationEvidence[]>([]);
  const [selectedDim, setSelectedDim] = useState<number | null>(null),
    [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]),
    [tool, setTool] = useState<Tool>("inspect"),
    [trace, setTrace] = useState<{ x: number; y: number }[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Label | null>(null),
    [heightMm, setHeightMm] = useState<number | null>(null),
    [markups, setMarkups] = useState<Markup[]>([]),
    [topologyNote, setTopologyNote] = useState("");
  const [facadeGross, setFacadeGross] = useState<number | null>(null),
    [openingAreas, setOpeningAreas] = useState<number[]>([]);
  const [workItem, setWorkItem] = useState(WORK_ITEMS[0].label);
  const manualCalibration = validateCalibration(manualEvidence),
    activeScale = manualCalibration.valid
      ? manualCalibration.mmPerUnit
      : autoScale,
    currentDoc = docs[docIndex];

  useEffect(() => {
    if (!focusMarkup) return;
    const m = focusMarkup.match(/^[A-Z]+(\d{2})-/);
    if (m) setPage(Number(m[1]));
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
          scopes: { page: number; text: string }[] = [],
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
              clauseFingerprint: hash(clauses),
            });
            if (kind !== "OTHER") hits.push({ page: n, kind, title });
            if (kind === "SCHEDULE")
              openings.push(
                ...parseOpeningSchedules(rowsFromPositionedText(items), n),
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
              .forEach((s) => scopes.push({ page: n, text: s.trim() }));
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
        const count = new Map<number, number>();
        dims
          .map((d) => d.mm)
          .filter((v) => v >= 2400 && v <= 3600)
          .forEach((v) => count.set(v, (count.get(v) || 0) + 1));
        setHeightMm(
          [...count]
            .filter(([, n]) => n >= 2)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        );
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
    kind: Markup["kind"],
    points: { x: number; y: number }[],
    label: string,
    q: number,
    unit: Markup["unit"] = "m²",
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
      ref = `P${String(page).padStart(2, "0")}-${prefix}${String(markups.filter((m) => m.page === page && m.kind === kind).length + 1).padStart(2, "0")}`;
    setMarkups((v) => [
      ...v,
      { ref, page, kind, points, label, quantity: q, unit },
    ]);
    return ref;
  };
  const evidenceBase = (ref: string) =>
    `${ref} · ${currentDoc.name} · P${page} · ${manualCalibration.valid ? "two-point reviewed calibration" : `${autoCalibration?.accepted.length || 0} independently agreeing figured dimensions`} · ${currentScale.toFixed(3)} mm/PDF pt`;
  const runTopology = (room: Label) => {
    setSelectedRoom(room);
    setTrace([]);
    if (!pageSize || !currentScale) {
      setTopologyNote(
        "Calibration must be validated before topology can produce a metric quantity.",
      );
      return;
    }
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
    if (!polygon) {
      setTopologyNote(
        "No defensible closed face found. Trace the room boundary; HX will not substitute a rectangle.",
      );
      setTool("room");
      return;
    }
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
    ) {
      setTopologyNote(
        "Topology candidate failed the room area/shape sanity gates and remains unmeasured. Trace the visible wall face for review.",
      );
      setTool("room");
      return;
    }
    setTrace(polygon.points);
    setTopologyNote(
      `${polygon.points.length}-vertex closed face found. Review the highlighted topology before adding quantities.`,
    );
    setTool("room");
  };
  const roomMatch = (scheduleRoom: string, room: string) =>
    scheduleRoom
      .toLowerCase()
      .replace(/bed\s+(\d+)/, "bedroom $1")
      .replace("master bed", "master bedroom")
      .includes(room.toLowerCase());
  const buildRoom = () => {
    if (
      !selectedRoom ||
      !pageSize ||
      !currentScale ||
      trace.length < 3 ||
      quantity <= 0
    )
      return;
    const ref = addMarkup("room", trace, selectedRoom.text, quantity),
      roomRows = schedule.filter((r) => roomMatch(r.room, selectedRoom.text)),
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
      rows: BoqDraft[] = [
        {
          id: `${ref}-FLOOR`,
          page,
          room: selectedRoom.text,
          item: "Floor area / finish",
          unit: "m²",
          qty: Number(quantity.toFixed(2)),
          scope: scope.length
            ? scope.map((s) => s.text).join(" | ")
            : "Measured floor area; finish specification not explicitly resolved.",
          sourcePages: scope.map((s) => s.page),
          evidence: `${base} · closed ${trace.length}-vertex topology`,
          markupRef: ref,
          status: "REVIEW",
        },
        {
          id: `${ref}-CEILING`,
          page,
          room: selectedRoom.text,
          item: "Ceiling area / finish",
          unit: "m²",
          qty: Number(quantity.toFixed(2)),
          scope:
            "Ceiling plan footprint matched to reviewed room topology; finish requires specification review.",
          evidence: `${base} · same horizontal room topology`,
          markupRef: ref,
          status: "REVIEW",
        },
        {
          id: `${ref}-SKIRT`,
          page,
          room: selectedRoom.text,
          item: "Skirting net of scheduled door openings",
          unit: "m",
          qty: Number(
            netPerimeter(
              tracePerimeter,
              doors.map((d) => d.widthMm / 1000),
            ).toFixed(2),
          ),
          scope: `Gross perimeter ${tracePerimeter.toFixed(2)} m less scheduled openings: ${doors.map((d) => `${d.tag} ${d.widthMm}mm`).join(", ") || "none resolved"}.`,
          sourcePages: [...new Set(doors.map((d) => d.page))],
          evidence: `${base} · schedule deductions`,
          markupRef: ref,
          status: "REVIEW",
        },
      ];
    if (heightMm)
      rows.push({
        id: `${ref}-WALL`,
        page,
        room: selectedRoom.text,
        item: "Internal wall finish / decoration net of openings",
        unit: "m²",
        qty: Number(
          netWallArea(tracePerimeter, heightMm / 1000, openings).toFixed(2),
        ),
        scope: `Perimeter × independently repeated ${heightMm}mm height less ${doors.length} door and ${windows.length} window schedule opening(s).`,
        sourcePages: [...new Set(roomRows.map((r) => r.page))],
        evidence: `${base} · repeated figured height ${heightMm}mm · schedule deductions`,
        markupRef: ref,
        status: "REVIEW",
      });
    else
      rows.push({
        id: `${ref}-WALL`,
        page,
        room: selectedRoom.text,
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
      setOpeningAreas((v) => [...v, quantity]);
      addMarkup(
        "opening",
        trace,
        `Opening ${openingAreas.length + 1}`,
        quantity,
      );
    }
    setTrace([]);
  };
  const addFacadeBoq = () => {
    if (!facadeGross) return;
    const net = netFacadeArea(
        facadeGross,
        openingAreas.map((a) => ({ width: a, height: 1 })),
      ),
      facade = markups
        .filter((m) => m.page === page && m.kind === "facade")
        .at(-1),
      openings = markups.filter((m) => m.page === page && m.kind === "opening"),
      scope = scopeFor(/brick|stone|render|cladding|external wall/i),
      ref = facade?.ref || `P${String(page).padStart(2, "0")}-F01`;
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
        scope: `Gross façade less ${openings.length} marked opening polygon(s).`,
      },
    ].forEach((r) =>
      onBoq?.({
        ...r,
        page,
        room: "Elevation",
        unit: "m²",
        sourcePages: scope.map((s) => s.page),
        evidence: `${evidenceBase(ref)} · deductions ${openings.map((x) => x.ref).join(", ") || "none"}`,
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
      scope = scopeFor(item.rx);
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
      evidence: `${evidenceBase(ref)} · ${item.unit === "nr" ? `${trace.length} marked points` : `${trace.length}-vertex ${item.unit === "m" ? "polyline" : "polygon"}`}`,
      markupRef: ref,
      status: "REVIEW",
    });
    setTrace([]);
    setTool("inspect");
  };
  const clickDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === "inspect") return;
    const r = e.currentTarget.getBoundingClientRect(),
      p = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
    if (tool === "calibrate" && selectedDim) {
      const next = [...calPts, p];
      setCalPts(next);
      if (next.length === 2 && pageSize) {
        const a = px(next[0], pageSize),
          b = px(next[1], pageSize);
        setManualEvidence((v) => [
          ...v.filter((x) => x.id !== `P${page}-${selectedDim}`),
          {
            id: `P${page}-${selectedDim}`,
            figuredMm: selectedDim,
            drawnLength: Math.hypot(b.x - a.x, b.y - a.y),
            page,
            drawing: currentDoc.name,
          },
        ]);
        setCalPts([]);
        setSelectedDim(null);
      }
      return;
    }
    setTrace((v) => [...v, p]);
  };
  const shown = markups.filter((m) => m.page === page);
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
        {(["inspect", "room", "facade", "opening", "gifa"] as Tool[]).map(
          (t) => (
            <button
              key={t}
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
        <strong>{activeScale ? "SCALE VALID" : "SCALE BLOCKED"}</strong>
        <span>
          {autoCalibration?.valid
            ? `${autoCalibration.accepted.length} independent figured dimensions · ${autoCalibration.spreadPct.toFixed(2)}% spread`
            : autoCalibration?.reason || "No independent calibration evidence"}
        </span>
        {activeScale && <span>{activeScale.toFixed(3)} mm/PDF pt</span>}
        <select
          value={selectedDim || ""}
          onChange={(e) => {
            setSelectedDim(Number(e.target.value) || null);
            setTool("calibrate");
            setCalPts([]);
          }}
        >
          <option value="">Manual check · choose dimension</option>
          {dimensions.slice(0, 50).map((d, i) => (
            <option key={i} value={d.mm}>
              {d.mm}mm · P{page}
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
