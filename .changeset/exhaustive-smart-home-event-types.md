---
"shc2es": minor
---

Add exhaustive type system for smart home events with discriminated unions. Replaces loose `[key: string]: unknown` interface with precise types for all 5 event types (DeviceServiceData, device, room, message, client), enabling compile-time type safety and exhaustive checking. Includes dedicated transforms module for testable transformation logic and fixes for edge cases discovered during integration testing (optional fields, defensive ID generation).
