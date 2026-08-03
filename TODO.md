# TODO — Update uploadToSupabase.js to cleanup outdated screenings

## Steps
- [x] Understand the current uploader implementation (full clean sync)
- [x] Verify the timestamp column name in the schema (`date_time`)
- [x] Get user approval on the plan
- [x] Modify `scrapers/uploadToSupabase.js`:
  - [x] Replace "delete ALL rows" with "delete outdated rows" using `.lt('date_time', nowISO)`
  - [x] Add cleanup logging (success/failure) as requested
  - [x] Update the header doc comment to reflect the new behavior
- [x] Verify the change (syntax check / optional run)
