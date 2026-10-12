// Canonical payloads, defined once and reused across tests.

// One week ahead, computed once per run so the default order is never
// scheduled in the past (whether the API should reject past dates is undecided).
export const scheduledForNextWeek = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1000,
).toISOString();

export const validOrder = {
  customerId: "cus_demo",
  items: [{ menuItemId: "burrito", quantity: 1, size: "REGULAR" }],
  fulfillment: { method: "PICKUP", scheduledFor: scheduledForNextWeek },
};

// Looks fine, breaks two rules on purpose (used for the 422 tests):
//   size must be UPPERCASE, fulfillment must be a nested object.
export const reasonableButWrong = {
  customerId: "cus_demo",
  items: [{ menuItemId: "burrito", quantity: 1, size: "medium" }],
  fulfillment: "pickup",
};

// GET /api/menu: strict UPPERCASE enum, case-sensitive, not normalized.
export const menuCategories = ["ENTREE", "SIDE", "DRINK"];

// A known, live-verified menu item used to assert real values (not just shape).
export const knownMenuItem = {
  id: "burrito",
  name: "Burrito",
  priceCents: 1095,
  category: "ENTREE",
};

// POST /api/orders: live-verified prices (cents). Size does not change price.
export const menuPriceCents = {
  burrito: 1095,
  bowl: 1045,
  tacos: 995,
  chips: 545,
  agua: 375,
};
export const menuItemIds = Object.keys(menuPriceCents);
export const orderSizes = ["SMALL", "REGULAR", "LARGE"];
export const fulfillmentMethods = ["PICKUP", "DELIVERY"];

// Truncated JSON body for the 400 malformed_json test.
export const malformedOrderJson = '{"customerId": "cus_demo", "items": [';

// Two-item order used to verify totalCents sums price x quantity.
export const multiItemOrderItems = [
  { menuItemId: "burrito", quantity: 2, size: "REGULAR" },
  { menuItemId: "chips", quantity: 1, size: "REGULAR" },
];

// Server-owned fields a client must not be able to set.
export const clientSuppliedServerFields = {
  id: "ord_client_chosen",
  status: "COMPLETED",
  createdAt: "2000-01-01T00:00:00.000Z",
};

// Empty body: every required field is missing.
export const emptyOrder = {};

// An order id that is well-formed but never issued.
export const unknownOrderId = "ord_does_not_exist";
