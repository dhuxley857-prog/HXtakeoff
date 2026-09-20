# HX Takeoff recognition guardrails

These rules are acceptance criteria for drawing intelligence and should be applied to future extraction work.

## Room classification
- A room ID must come from an explicit room-name text item or a validated room/schedule reference.
- Use whole-label matching, not substring matching. A construction note containing a room-like word must not become a room.
- Supported room labels include Sitting Room, Living Room, Kitchen, Kitchen/Dining, Dining Room, Hall, Bedroom (+ number), Bathroom, Bath, WC, Utility Room, Study and Garage.
- Material, specification and construction-note text such as ply lining must remain annotation/spec evidence and must never be classified as a room.
- Preserve the exact source label separately from any normalised room type.

## Spatial validation
- Convert source PDF coordinates through the PDF.js viewport transform.
- A room label is provisional until its coordinate lies within/adjacent to a plausible enclosed room region.
- Do not merge nearby text items merely because they occupy the same visual area.
- If classification or spatial validation is ambiguous, flag REVIEW rather than inventing an ID.

## Regression cases
- "Sitting Room" must be detected as a room.
- "Ply lining" must not be detected or grouped as a room.
