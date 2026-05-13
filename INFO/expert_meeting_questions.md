# Expert Meeting Questions

Questions for the industry expert (Consult&Co practitioner). Ordered by impact — what changes the demo or the product if answered well, not just what's interesting to know.

---

## Tier 1 — Ask these first (changes the demo or a load-bearing decision)

**1. What finding actually lands?**
We have a suspense blocker (€39,893), overdue payables (€45,412 across 26 invoices), a €920K revenue gap, and 14 overdue receivables. Which of these would make someone who does closing work for a living say "yes, that's actually useful"? We need to know which card to lead with in the demo.

**2. Does the "responsible AI" framing resonate with practitioners?**
The entire demo is built around refusing to generate AI advice on dirty data. Does that framing land with someone who does this work — or does it sound like an engineer's metaphor? How would you describe the risk of AI advice on unreconciled data to a client or a regulator?

**3. What does a real closing memo look like?**
Emma is prompting Claude with check results to generate an advisory output. Is a closing memo a narrative ("the suspense account suggests unreconciled intercompany entries — resolve before signing off") or a structured action list? If you can describe the format an accountant would actually find useful, that's what the AI prompt should target.

**4. Is a non-zero suspense account always a hard blocker for closing?**
Account 1250 ("Nog te duiden") has €39,893 at year-end. We made it a hard blocker — the system refuses to generate AI advice until it clears. But in practice: are there legitimate reasons for it to carry over? When do you escalate vs. just reclassify?

---

## Tier 2 — Ask second (validates specific decisions we made without expert input)

**5. Does "refuse to advise on dirty data" actually match how accountants work?**
We built the system to refuse to generate AI advice until data quality passes a threshold. Do human accountants wait until data is clean before forming a view — or do you form a preliminary opinion while issues are still open and refine as they close out?

**6. Who actually reads the output?**
We designed the report for the accountant, not the client. But who reads something like this in practice — the partner signing off, the junior doing fieldwork, or the client's CFO? The answer changes all three screens.

**7. Are our scoring thresholds defensible?**
We score readiness as `1.0 - penalties` where high-severity = 0.20 and medium = 0.10. We set "advice ready" at ≥ 0.60. These numbers came from us. Is there an industry concept for closing readiness thresholds we should reference, or is this always engagement-specific?

**8. What's behind the €920K revenue gap?**
Revenue reconciliation shows GL revenue = €0 vs sales files = €920K. We assumed it's an Exact Online import timing issue — entries not yet posted. But could it indicate something more serious: revenue recognition timing, a booking error, or a client-side Exact Online setup problem? Judges will ask about this finding specifically.

**9. Would an accountant trust AI-generated closing advice as a draft to put their name on?**
Or only as a checklist to verify against their own judgement? That changes whether Screen 3 should feel like a document or a summary panel.

---

## Tier 3 — If time allows (interesting, but lower implementation impact)

**10. Sequencing fixes when multiple issues fire simultaneously**
When you get a closing readiness report with 5 issues, what's your mental model for ordering the fixes? Is there a dependency order (suspense must clear before revenue can reconcile), or do you hand the full list to the client and work in parallel?

**11. Configurable thresholds for AR/AP aging**
We used 90 days — a common standard. But should that be configurable per client? A seasonal bike workshop might have different cash flow norms than a B2B company. Do you actually set these per engagement?

**12. Time pressure context**
When is a tool like this used in the closing process — weeks before the deadline when there's still time to fix material issues, or days before when it's already too late for anything significant?

**13. CIT provisional = final (suspiciously clean)**
Both provisional and final CIT statements show exactly €96,365.31 — a perfect match. Does that raise a flag? Does it suggest the client copied the provisional into the final filing rather than recalculating from actual year-end numbers?

**14. How clean is this data compared to real engagements?**
Is the Morgenwind export representative of what you'd receive from a typical Dutch SME, or is this already sanitised? Knowing how messy real data gets would change how defensive our checks need to be.

**15. Why does a single entity have an intercompany register?**
There's an `intercompany_register.csv` in the data. Why would a single Dutch SME have intercompany entries — holding structure, related-party transactions, or just Exact Online exporting that file by default?

**16. How common are VAT provisional corrections for a business this size?**
We built a check that flags multiple VAT payments for the same quarter (correction/supplementary filing signal). Our data is clean — zero corrections. Is that genuinely expected for a business this size, or did we get sanitised demo data?
