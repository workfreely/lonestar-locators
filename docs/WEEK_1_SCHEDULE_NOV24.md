# The first week, in the app — 24 to 30 November 2026

84 posts, 42 Instagram and 42 TikTok, fourteen on each of the six accounts. Two slots a day at
07:30 and 19:30 Central, Instagram and TikTok mirrored within each account group.

**This file is generated.** `npx tsx scripts/week-queue-report.ts` reads it out of
`social_posts` and `social_connections`, so it reports what is actually scheduled rather than what
a selector would choose today. The selection itself lives in `scripts/weekOneSelection.ts` and the
rows were written by `scripts/build-week-queue.ts`.

## What holds the week together

- **Duplicate scheduling is the database's job.** `social_posts_connection_slot_uidx` is unique on
  (connection_id, scheduled_at): one account cannot hold two posts at one instant, whatever writes
  them. `social_posts_content_connection_dest_uidx` additionally forbids the same video twice on
  one account and surface while unpublished.
- **No property repeats inside an account group** across the seven days, asserted by the builder.
- **Personal videos never leave their owner.** Jay's South Side video is Personal — Only me and
  appears on his accounts only; Lisette's debut is assigned to her and appears on hers only.
- **Catch-up publishing is capped twice over**: a post scheduled before Auto Posting was resumed is
  skipped (`isEligibleAfterResume`), and nothing more than two hours late publishes automatically
  (`MAX_LATENESS_MS`).
- **Approval is the last gate and it is manual.** Every publish path filters on `approved_at`.

## The schedule as scheduled

# The first week, as scheduled — 24 to 30 November 2026

84 posts across six accounts, two slots a day at 07:30 and 19:30 Central.
Rendered 7/84 · approved 0/84 · published 0/84


Tue, Nov 24, 07:30 Central   (2026-11-24T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Village at Lexington Ranch | Dallas | rendered | not approved |
| Dallas @locatorbeast | instagram | Village at Lexington Ranch | Dallas | rendered | not approved |
| Lisette @locatorlisette | instagram | South Side Living and Maker Spaces | Lof | San Antonio | rendered | not approved |
| Lisette @locatorlisette | tiktok | South Side Living and Maker Spaces | Lof | San Antonio | rendered | not approved |
| Main @realestatepro_tx | instagram | South Side Living and Maker Spaces | Lof | San Antonio | rendered | not approved |
| Main @realestatepro_tx | tiktok | South Side Living and Maker Spaces | Lof | San Antonio | rendered | not approved |

Tue, Nov 24, 19:30 Central   (2026-11-25T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | East Quarter Residences | Dallas | rendering | not approved |
| Dallas @locatorbeast | instagram | East Quarter Residences | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Oasis at Round Rock | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | Oasis at Round Rock | Austin | rendering | not approved |
| Main @realestatepro_tx | instagram | Oasis at Round Rock | Austin | none | not approved |
| Main @realestatepro_tx | tiktok | Oasis at Round Rock | Austin | none | not approved |

Wed, Nov 25, 07:30 Central   (2026-11-25T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Mondrian West Village | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Mondrian West Village | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Calvert | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | The Calvert | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | The Calvert | San Antonio | none | not approved |
| Main @realestatepro_tx | tiktok | The Calvert | San Antonio | none | not approved |

Wed, Nov 25, 19:30 Central   (2026-11-26T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | AMLI Fountain Place | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | AMLI Fountain Place | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Railyard Apartments | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | Railyard Apartments | Austin | none | not approved |
| Main @realestatepro_tx | instagram | Alta River Oaks | Houston | none | not approved |
| Main @realestatepro_tx | tiktok | Alta River Oaks | Houston | none | not approved |

Thu, Nov 26, 07:30 Central   (2026-11-26T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Cirque Residences | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Cirque Residences | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Calvert A2 1 Bed Model Remix | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | The Calvert A2 1 Bed Model Remix | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | Village at Lexington Ranch | Dallas | none | not approved |
| Main @realestatepro_tx | tiktok | Village at Lexington Ranch | Dallas | none | not approved |

Thu, Nov 26, 19:30 Central   (2026-11-27T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | The Oliver Dallas Corner Unit #2 | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | The Oliver Dallas Corner Unit #2 | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Nexus East | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | Nexus East | Austin | none | not approved |
| Main @realestatepro_tx | instagram | The Calvert A2 1 Bed Model Remix | San Antonio | none | not approved |
| Main @realestatepro_tx | tiktok | The Calvert A2 1 Bed Model Remix | San Antonio | none | not approved |

Fri, Nov 27, 07:30 Central   (2026-11-27T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | The Oliver Dallas Corner Unit | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | The Oliver Dallas Corner Unit | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Altitude at Brooks | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | Altitude at Brooks | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | Railyard Apartments | Austin | none | not approved |
| Main @realestatepro_tx | tiktok | Railyard Apartments | Austin | none | not approved |

Fri, Nov 27, 19:30 Central   (2026-11-28T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Adam Hats Lofts | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Adam Hats Lofts | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Sienna at the Thompson | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | Sienna at the Thompson | Austin | none | not approved |
| Main @realestatepro_tx | instagram | East Quarter Residences | Dallas | none | not approved |
| Main @realestatepro_tx | tiktok | East Quarter Residences | Dallas | none | not approved |

Sat, Nov 28, 07:30 Central   (2026-11-28T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | The Drake White Rock | Dallas | rendered | not approved |
| Dallas @locatorbeast | instagram | The Drake White Rock | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | 120 Ninth Street | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | 120 Ninth Street | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | Astra Benders Landing | Houston | none | not approved |
| Main @realestatepro_tx | tiktok | Astra Benders Landing | Houston | none | not approved |

Sat, Nov 28, 19:30 Central   (2026-11-29T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Town Arlington | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Town Arlington | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Watson Convertible Studio | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | The Watson Convertible Studio | Austin | none | not approved |
| Main @realestatepro_tx | instagram | The Standard at Legacy | San Antonio | none | not approved |
| Main @realestatepro_tx | tiktok | The Standard at Legacy | San Antonio | none | not approved |

Sun, Nov 29, 07:30 Central   (2026-11-29T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | The Waylon Apartments & Townhomes | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | The Waylon Apartments & Townhomes | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | Melissa Ranch Apartments | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | Melissa Ranch Apartments | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | Mondrian West Village | Dallas | none | not approved |
| Main @realestatepro_tx | tiktok | Mondrian West Village | Dallas | none | not approved |

Sun, Nov 29, 19:30 Central   (2026-11-30T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | One Dallas Center | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | One Dallas Center | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Watson A4.1 1 Bed 1 Bath Large Patio | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | The Watson A4.1 1 Bed 1 Bath Large Patio | Austin | none | not approved |
| Main @realestatepro_tx | instagram | Nexus East | Austin | none | not approved |
| Main @realestatepro_tx | tiktok | Nexus East | Austin | none | not approved |

Mon, Nov 30, 07:30 Central   (2026-11-30T13:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Uptown by Onni | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Uptown by Onni | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Standard at Legacy | San Antonio | none | not approved |
| Lisette @locatorlisette | tiktok | The Standard at Legacy | San Antonio | none | not approved |
| Main @realestatepro_tx | instagram | Altitude at Brooks | San Antonio | none | not approved |
| Main @realestatepro_tx | tiktok | Altitude at Brooks | San Antonio | none | not approved |

Mon, Nov 30, 19:30 Central   (2026-12-01T01:30:00+00:00)

| account | platform | property | market | render | approved |
|---|---|---|---|---|---|
| Dallas @locator.beast | tiktok | Whitney Uptown | Dallas | none | not approved |
| Dallas @locatorbeast | instagram | Whitney Uptown | Dallas | none | not approved |
| Lisette @locatorlisette | instagram | The Watson A4.1 1 Bed 1 Bath | Austin | none | not approved |
| Lisette @locatorlisette | tiktok | The Watson A4.1 1 Bed 1 Bath | Austin | none | not approved |
| Main @realestatepro_tx | instagram | The Langley | Houston | none | not approved |
| Main @realestatepro_tx | tiktok | The Langley | Houston | none | not approved |
