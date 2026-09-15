# OWNER-BUSINESS-DATA-RESET-001

Implementation branch only. Do not merge without Central review.

Base: `31efd82076a3d750d587320067247b58e580abed`

Hard reset target nodes:
- `/products`
- `/sales`
- `/purchases`
- `/stockOuts`
- `/stockMovements`
- `/stockOperations`
- `/stocktakes`
- `/productDeletionLocks`

Retained nodes:
- `/users`
- `/categories`
- `/customers`
- `/suppliers`
- `/expenses`
- `/settings`
- existing `/auditLogs`

The reset reuses the existing browser JSON backup system. Restore write remains safety-blocked by the existing contract.
