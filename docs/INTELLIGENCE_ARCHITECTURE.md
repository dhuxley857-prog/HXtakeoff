# HX Takeoff intelligence architecture

## Principle
AI interprets construction intent; deterministic geometry calculates quantities; evidence validation controls confidence; a human approves.

## Pipeline
1. PDF ingestion: preserve original sheet and render pages.
2. Parser: extract text/vector geometry where available and classify scanned/vector PDFs.
3. Calibration: derive scale from explicit calibration or drawing dimensions; store source and tolerance.
4. Object intelligence: identify rooms, walls, doors, windows, finishes, tags and candidate boundaries.
5. Specification matcher: link drawing tags to schedules/specification clauses with source references.
6. Geometry engine: calculate length/area/count from stored coordinates.
7. Rules engine: apply trade-specific take-off rules and deductions.
8. Validator: compare geometry against dimensions, schedules and independent evidence.
9. Review: AI Generated → Checked → Amended → Approved/Rejected.
10. Learning dataset: retain AI proposal and approved correction for evaluation/future specialist models.

## Non-negotiable
No generated quantity becomes approved without visible source geometry and an audit trail. Low-confidence or conflicting evidence requires manual review.

## V1 architectural scope
Rooms, partitions, doors/windows, flooring, ceilings and skirting. Groundworks/structure/MEP follow once the architectural benchmark is reliable.
