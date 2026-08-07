# TODO — Capture Onyx/Lounge (and fix Jerusalem) in the scraper

## Root cause (diagnosed via live probes)
- The `EventsFlat` endpoint's `VenueType` field only ever returns `""`, `Vip`, or
  `Prime`. It NEVER returns `Onyx`/`Lounge` — those halls are identified ONLY by
  the query filter `VenueTypeId` (Onyx=8, Lounge=201 from ticketsNew2.js).
- Querying `VenueTypeId=0` (what the scraper does) excludes Onyx/Lounge entirely,
  so Glilot's 22 Onyx + 50 Lounge screenings are missed.
- Querying `VenueTypeId=0` also returns HTTP 500 for Jerusalem (theater 1174),
  which is why the Jerusalem branch has no entries.

## Plan
- [ ] Rewrite the scraper's per-branch fetch to loop over venue types:
      Ragil=1, VIP=3, Onyx=8, Lounge=201 (plus LateNight=7, Late-VIP=31).
- [ ] Tag each screening with the hall type from the query filter (Onyx/Lounge/etc.),
      falling back to the response's `VenueType` field for Prime/VIP.
- [ ] Deduplicate merged events by eventID, preferring the more specific hall type.
- [ ] Extend `mapScreenType` aliases + `HallType` union in src/data.ts to include
      Onyx/Lounge/Prime.
- [ ] Re-run scraper on Glilot + Jerusalem to verify Onyx/Lounge and Jerusalem rows appear.

## Why Jerusalem was empty
`EventsFlat?VenueTypeId=0` returns HTTP 500 for theater 1174 (Jerusalem). The per-type
query (VenueTypeId=1/3) works fine there, so after this fix Jerusalem populates.

