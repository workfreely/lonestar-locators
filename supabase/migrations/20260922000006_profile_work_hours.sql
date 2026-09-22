-- Profile Working Hours — the locator-local window for SCHEDULED / relative
-- system-generated Next Action due times. Configuration ONLY: no behavior here.
--
-- Enforcement stays centralized in lib/workflow/normalizeToWorkingWindow: these
-- columns feed that function via resolveWorkHoursFromProfile. NULL / unconfigured
-- (both NULL) → the existing 9 AM–9 PM default. Immediate/do-it-now actions and
-- genuine tour/appointment timestamps are never affected.
--
-- Self-updatable is intentional: Working Hours are a personal scheduling
-- preference (like profiles.timezone), written by the locator via the dedicated
-- /api/admin/profile/work-hours route. This is NOT an authorization boundary.

alter table public.profiles
  add column if not exists work_hours_start smallint,
  add column if not exists work_hours_end   smallint;

-- Validity invariant: either BOTH NULL (use the default), or a well-formed window
-- with start in [0,23], end in [1,24], and start < end. `not valid` so the add
-- never fails on any pre-existing row (there are none with these columns yet); new
-- and updated rows are checked. A half-configured or inverted window is rejected
-- at the DB, mirroring resolveWorkHoursFromProfile's client-side guard.
alter table public.profiles
  add constraint profiles_work_hours_valid
  check (
    (work_hours_start is null and work_hours_end is null) or
    (work_hours_start between 0 and 23 and work_hours_end between 1 and 24 and work_hours_start < work_hours_end)
  ) not valid;
