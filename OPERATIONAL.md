# SHIFA Operational Standard

SHIFA is a critical humanitarian health and safety system. Work in this repository must assume that defects can contribute to life-or-death outcomes in conflict and displacement settings.

Engineering requirements:

- No silent stubs, fake success states, or placeholder implementations in production paths.
- Every safety-critical path must fail closed, queue for retry when appropriate, and preserve an audit trail.
- Backend unavailability must not block SHIFA Guard emergency SMS dispatch from the field device.
- Clinical decision support must keep the CHW in control, default to referral on uncertainty, and preserve reasoning/confidence for review.
- Any integration that handles alerts, patient triage, location, or recipient data must be implemented with explicit validation, typed contracts, durable logging, and tests where the platform allows.
- Claims of field readiness require deployed smoke tests, real credential tests, offline/poor-network tests, and clinical/humanitarian partner review.
- Avoid broad refactors while fixing critical behavior. Keep changes reviewable and verify after every safety-relevant change.

Current ML validation standard:

- Report the clinical model as a combined system: fine-tuned Gemma 4 E4B plus deterministic WHO/IMCI guardrails.
- Keep raw model metrics separate from guarded clinical-safety metrics.
- The current acceptable submission claim is 96.7% guarded decision accuracy, 100.0% urgent referral recall, and 0.0% urgent misses on the 60-case multilingual validation set.
- Do not claim full offline mobile readiness until LiteRT/mobile packaging, custom APK integration, and physical-device airplane-mode inference are complete.
- Treat danger-sign extraction below target and high over-referral as next-phase safety/product work, not as reasons to bypass guardrails.
- Preserve `training_manifest.json`, `validation_metrics.json`, and `upload_manifest.json` as the evidence trail for submitted model claims.

This standard applies to backend, dashboard, and mobile work.
