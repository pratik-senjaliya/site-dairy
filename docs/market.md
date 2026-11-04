# Market — Ahmedabad builders, how sites run, what we solve

Written 2026-11-04 for the Diwali launch. Sources: web research (links at the end), the builders' call of
2026-10-27 (see `docs/decisions.md`), and the owner's own knowledge of Ahmedabad sites. Web sources on small
builders are thin and mostly vendor blogs; treat numbers as indicative.

## Who we sell to

| | Small (main target) | Medium (target) | Large (not now) |
|---|---|---|---|
| Sites | 1–2 | 3–5 | 5+ |
| Typical work | bungalows, row houses, G+4 flats, small shops | 2–3 apartment schemes at once | towers, townships |
| Who runs the site | the owner himself + 1 supervisor | an engineer + a supervisor per site, part-time accountant | project managers, ERP, Tally team |
| Money | own money, partners (often family), flat bookings | partners, bookings, bank loan | institutional |
| Today's tools | notebook, diary, WhatsApp, calculator | same + Excel at the office | ERP / Procore-type |

Both small and medium run everything from the phone. Nobody opens a laptop on site, and the owner reads
WhatsApp, not dashboards. **Decision (2026-11-04): no web panel for launch.** Every role works from the app
(see `docs/decisions.md`).

## How a site runs today

- **Labour comes through contractors** (mukadam / trade contractors), not hired directly. Builders give work
  by trade, often **per sq ft** (centering, slab, brickwork, plaster) and sometimes by day ([HDRC study][hdrc]).
  The trades are centering, saliya (steel binding), chantar (masonry), plaster, bharai, plumbing, electric,
  colour and tiles.
- **Upad (advances)** go to contractors through the week. Hisab is weekly or by bill, and disputes come from
  "how many days / how many sq ft / how much upad already".
- **Material**: cement, steel, RMC, sand, kapchi and bricks come from 3–6 parties on credit and are paid by
  cheque or RTGS later. Steel, cement and labour make up about three-quarters of cost ([survey][t2r]), and
  suppliers no longer hold rates ([geosquare][geo]). So rate per receipt matters.
- **Theft and leakage are real**: material stolen from sites (₹4 lakh at Shilaj, Jan 2026), and staff diverting
  ₹1.45 crore through payments and material at an Ahmedabad firm (Aug 2026) ([GS][gs-theft], [DeshGujarat][dg-fraud]).
  The owner wants proof: a challan photo, who received it, and how much is left.
- **Labour shortage in 2026**: many workers did not return after Holi, and CREDAI Ahmedabad asked GujRERA for
  deadline relief ([propnewstime][pnt], [geosquare][geo]). Owners watch head count every day.
- **Diwali**: sites slow down before Diwali, RMC plants shut ([DeshGujarat][dg-quarry]), and migrant labour
  goes home. Business restarts on **Labh Pancham, Sat 14 Nov 2026**, when Gujarati traders open their new
  chopda ([Shubh Panchang][labh]).
- **Partners and bookings**: flats are sold during construction and buyers pay by stage (plinth, slab,
  finishing) ([Rustomjee][stages]). Partners want to see where the money went without trusting one diary.

## Competitors

| App | Pitch | Price (indicative) |
|---|---|---|
| Powerplay | site updates, material, attendance; "5L+ downloads" | free basic, paid from ~₹199/user/month ([ONES][ones]) |
| Onsite | BOQ, labour, material, subcontractors, finance | ~₹12,000 + GST per user/year ([Site Setu][setu-cost]) |
| RDash | photo logs, WhatsApp | ~₹1,500/month |
| BuildNext | mid-size residential | ~₹4,000/month |

They are **English-first, per-user priced, and built for a project-management office**. Powerplay's own CEO
says adoption needs education ([NBMCW][nbmcw]), and reviews mention training and value for money
([Capterra][capterra]).

**Our edge:** Gujarati first, every entry reads as a diary line, works offline, priced per site (not per
user), and it knows Ahmedabad money habits: upad, party accounts with cheques, the partners' book.

## Problems → what the app does

| Problem the builder has | Status | Where |
|---|---|---|
| "How many men were on site today, per contractor?" | ✅ | attendance, nightly report |
| "How much upad has this contractor taken, what do I owe?" (daily-rate) | ✅ | upad, hisab |
| "Centering is per sq ft: how much did he do, how much is billed, how much paid?" | ✅ (4 Nov) | measurement → hisab → bill → paid |
| "Did the 2,500 kg of steel actually come? Show me the challan" | ✅ | GRN with photo, stock |
| "How much cement is left, who used it where?" | ✅ | material used, stock, low-stock |
| "What do I owe each party, which cheque went when?" | ✅ | supplier accounts, cheque numbers |
| "Partners: where did the money go?" | ✅ | money book, who wrote each line |
| "Which buyer owes the slab instalment?" | ✅ (4 Nov) | payment plan per site, stage done → due now, WhatsApp reminder |
| "I am not on site: what happened today?" | ✅ code / 🟡 hosting | 8 pm report (needs Render paid so it doesn't sleep) |
| "Rates keep changing" | ✅ (4 Nov) | last rate per party per material, lowest marked, on the order screen too |
| Site closed for Diwali / rain | ✅ | day marker |

## UX that wins on site

1. **First 10 minutes decide it.** The owner installs, logs in, adds a site, adds 3 contractors and the
   supervisor's phone, and the supervisor enters attendance that day. Every extra screen loses builders.
   A sleeping server (50 s first login on Render free) looks broken at a demo.
2. **The supervisor's 2 minutes**: steppers, chips, yesterday's numbers pre-filled, photo instead of typing.
   Gujarati site words, units in English. Already the rule; keep it.
3. **The owner reads WhatsApp**: the nightly report link and PDF on WhatsApp matter more than any screen.
4. **Proof over data**: photo, GPS, who wrote it, when. That is what stops leakage and partner fights.
5. **No per-user pricing**: builders will not pay for each supervisor. Price per site per month, with the
   first site free until Holi or similar. The owner decides pricing.

## Launch plan: Diwali → Labh Pancham

Sites are slow from about 5 Nov until Labh Pancham (14 Nov). Announce at Diwali ("આ નવા વર્ષે સાઇટનો ચોપડો
મોબાઇલમાં") and go live with builders on **Labh Pancham, 14 Nov**, when sites and books restart. That gives
about 9 days.

**Must before 14 Nov**
1. Render paid instance, so login is instant and the 8 pm report runs (owner: ~$7/month).
2. Onboarding as a closed list: we add each launch builder's number to `SIGNUP_OPEN`. MSG91 DLT approval
   can take days to weeks, so open signup comes later.
3. Photo flow on a cheap phone (camera, GPS, upload queue), the one field flow never tried on a device.
4. A new pilot APK and a new demo APK from the same code, shared as a link on WhatsApp (Play Store later).
5. A first-day path for a new builder, tested end to end on the phone (`e2e:firstday` covers the API).
6. Gujarati wording check by the owner.

**First month after launch (by impact)** — items 1–3 built on 4 Nov (see `CHANGELOG.md`)
1. **Contractor bills by measurement**: work given per sq ft / rft / nos at a rate, measured quantity entered
   from the phone with a photo, bill = qty × rate − upad, owner approves, paid. Biggest gap for Ahmedabad.
2. **Buyer instalments by stage**: schedule per flat (booking, plinth, each slab, finishing); when progress
   marks a slab done, the due list updates and the owner can send the buyer a WhatsApp reminder.
3. **Party rate compare**: last rate per material from each party at the moment of ordering.
4. MSG91 SMS OTP → open signup; Play Store internal track.

## Sources

[hdrc]: https://hdrc-sxnfes.org/wp-content/uploads/2020/04/Construction-labour-summary.pdf
[t2r]: https://track2realty.track2media.com/?p=4638
[geo]: https://www.geosquare.in/ahmedabad-real-estate-faces-material-shortages-and-labour-crunch-slowing-project-40379-news.html
[pnt]: https://propnewstime.com/getdetailsStories/MjkzNTA=/ahmedabad-real-estate-hit-by-material-shortage-and-labour-crunch-slowing-project-execution
[gs-theft]: https://english.gujaratsamachar.com/news/gujarat/4-lakh-of-construction-material-stolen-from-open-plot-in-ahmedabads-shilaj-21922623862.html
[dg-fraud]: https://deshgujarat.com/2026/08/29/trio-booked-for-siphoning-rs-1-45-crore-from-construction-firm-in-ahmedabad/
[dg-quarry]: https://deshgujarat.com/2024/10/17/quarry-operators-across-gujarat-end-strike
[labh]: https://shubhpanchang.com/festivals/laabh-pancham
[stages]: https://www.rustomjee.com/blog/payment-plans-in-real-estate-a-mumbai-buyer-s-guide/
[ones]: https://ones.com/blog/construction-project-management-software-india-9-best-platforms/
[setu-cost]: https://sitesetu.in/blog/construction-software-cost-india-2026
[nbmcw]: https://www.nbmcw.com/product-technology/technologies-digitilization-software/powerplay-cloud-based-construction-management-platform.html
[capterra]: https://www.capterra.in/software/1036292/powerplay

Also read: [Ahmedabad labour rates](https://yojoapp.com/en/labour-rates/ahmedabad/), [RCC labour rates](https://www.houseyog.com/blog/rcc-work-labour-cost-india/),
[sub-contractor billing practice](https://sitesetu.in/blog/subcontractor-management-india).
