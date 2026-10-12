// Builds order request payloads. The valid case is the default; invalid
// variants are explicit. Builders construct payloads and never call the API.
import { validOrder } from "../data/fixtures.js";

export function anOrder() {
  const order = structuredClone(validOrder);
  const builder = {
    build: () => structuredClone(order),
    withSize(s) { order.items[0].size = s; return builder; },
    withFulfillment(f) { order.fulfillment = f; return builder; },
    withCustomerId(v) { order.customerId = v; return builder; },
    without(key) { delete order[key]; return builder; },
    withItems(arr) { order.items = structuredClone(arr); return builder; },
    withServerOwnedFields(fields) { Object.assign(order, fields); return builder; },
    withQuantity(q) { order.items[0].quantity = q; return builder; },
    withMenuItemId(id) { order.items[0].menuItemId = id; return builder; },
    withMethod(m) { order.fulfillment = { ...order.fulfillment, method: m }; return builder; },
    withScheduledFor(s) { order.fulfillment = { ...order.fulfillment, scheduledFor: s }; return builder; },
  };
  return builder;
}

// Usage:  anOrder().withSize("LARGE").build()
