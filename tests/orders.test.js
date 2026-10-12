import { test } from "node:test";
import assert from "node:assert/strict";
import { ordersClient } from "../src/clients/orders.client.js";
import { anOrder } from "../src/models/order.builder.js";
import {
  validOrder,
  reasonableButWrong,
  menuPriceCents,
  menuItemIds,
  orderSizes,
  fulfillmentMethods,
  malformedOrderJson,
  multiItemOrderItems,
  clientSuppliedServerFields,
  emptyOrder,
  unknownOrderId,
} from "../src/data/fixtures.js";

const TIMEOUT = { timeout: 60000 }; // Render cold starts

const sorted = (a) => [...a].sort();

// Shared 422 envelope check; returns the violations.
function assertValidationFailed({ status, body }) {
  assert.equal(status, 422);
  assert.equal(body.error, "validation_failed");
  assert.ok(Array.isArray(body.violations));
  assert.ok(body.violations.length > 0);
  assert.ok(
    body.violations.every((v) => typeof v.hint === "string" && v.hint.length > 0),
    "every violation has a hint",
  );
  return body.violations;
}

function violationFor(violations, field) {
  const v = violations.find((x) => x.field === field);
  assert.ok(v, `expected a violation for ${field}`);
  return v;
}

test("creates an order when the body is valid", TIMEOUT, async () => {
  const { status, body } = await ordersClient.create(validOrder);
  assert.equal(status, 201);
  assert.match(body.id, /^ord_/);
  assert.equal(body.customerId, validOrder.customerId);
  assert.equal(body.status, "PLACED");
  assert.deepEqual(body.items, validOrder.items);
  assert.deepEqual(body.fulfillment, validOrder.fulfillment);
  assert.equal(body.totalCents, menuPriceCents.burrito);
  assert.ok(!Number.isNaN(Date.parse(body.createdAt)));
});

test("persists the created order so it can be read back by its id", TIMEOUT, async () => {
  const created = await ordersClient.create(validOrder);
  assert.equal(created.status, 201);

  const { status, body } = await ordersClient.get(created.body.id);
  assert.equal(status, 200);
  assert.equal(body.id, created.body.id);
  assert.equal(body.customerId, validOrder.customerId);
  assert.equal(body.status, "PLACED");
  assert.deepEqual(body.items, validOrder.items);
  assert.deepEqual(body.fulfillment, validOrder.fulfillment);
  assert.equal(body.totalCents, created.body.totalCents);
});

test("computes totalCents as the sum of price x quantity across items", TIMEOUT, async () => {
  const expectedTotal = multiItemOrderItems.reduce(
    (sum, i) => sum + menuPriceCents[i.menuItemId] * i.quantity,
    0,
  );
  const { status, body } = await ordersClient.create(
    anOrder().withItems(multiItemOrderItems).build(),
  );
  assert.equal(status, 201);
  assert.deepEqual(body.items, multiItemOrderItems);
  assert.equal(body.totalCents, expectedTotal);
  assert.equal(body.totalCents, 2735);
});

test("accepts DELIVERY as the fulfillment method", TIMEOUT, async () => {
  const { status, body } = await ordersClient.create(anOrder().withMethod("DELIVERY").build());
  assert.equal(status, 201);
  assert.equal(body.fulfillment.method, "DELIVERY");
  assert.equal(body.totalCents, menuPriceCents.burrito);
});

for (const size of orderSizes) {
  // Documents current behaviour: size does not affect price (open product question).
  test(`does not change totalCents when the size is ${size}`, TIMEOUT, async () => {
    const { status, body } = await ordersClient.create(anOrder().withSize(size).build());
    assert.equal(status, 201);
    assert.equal(body.items[0].size, size);
    assert.equal(body.totalCents, menuPriceCents.burrito);
  });
}

for (const id of menuItemIds) {
  test(`prices an order of ${id} at its menu price`, TIMEOUT, async () => {
    const { status, body } = await ordersClient.create(anOrder().withMenuItemId(id).build());
    assert.equal(status, 201);
    assert.equal(body.items[0].menuItemId, id);
    assert.equal(body.totalCents, menuPriceCents[id]);
  });
}

test("multiplies the item price by a large quantity", TIMEOUT, async () => {
  const { status, body } = await ordersClient.create(anOrder().withQuantity(100).build());
  assert.equal(status, 201);
  assert.equal(body.items[0].quantity, 100);
  assert.equal(body.totalCents, menuPriceCents.burrito * 100);
});

test("returns 404 not_found for an order id that does not exist", TIMEOUT, async () => {
  const { status, body } = await ordersClient.get(unknownOrderId);
  assert.equal(status, 404);
  assert.equal(body.error, "not_found");
  assert.ok(body.message.includes(unknownOrderId));
});

test("rejects a lowercase, non-enum size with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withSize("medium").build());
  const v = violationFor(assertValidationFailed(res), "items[0].size");
  assert.equal(v.code, "unknown_value");
  assert.deepEqual(sorted(v.allowed), sorted(orderSizes));
});

test("rejects a string fulfillment with 422 because it must be an object", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withFulfillment("pickup").build());
  const v = violationFor(assertValidationFailed(res), "fulfillment");
  assert.equal(v.code, "invalid_type");
});

test("rejects an order without a customerId with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().without("customerId").build());
  const v = violationFor(assertValidationFailed(res), "customerId");
  assert.equal(v.code, "required");
});

test("rejects an empty items array with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withItems([]).build());
  const v = violationFor(assertValidationFailed(res), "items");
  assert.equal(v.code, "required");
});

test("rejects an unknown menuItemId with 422 and lists the valid ids", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withMenuItemId("sushi").build());
  const v = violationFor(assertValidationFailed(res), "items[0].menuItemId");
  assert.equal(v.code, "unknown_value");
  assert.deepEqual(sorted(v.allowed), sorted(menuItemIds));
});

test("rejects a zero quantity with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withQuantity(0).build());
  const v = violationFor(assertValidationFailed(res), "items[0].quantity");
  assert.equal(v.code, "out_of_range");
});

test("rejects a negative quantity with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withQuantity(-1).build());
  const v = violationFor(assertValidationFailed(res), "items[0].quantity");
  assert.equal(v.code, "out_of_range");
});

test("states the expected and received values in a quantity violation", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withQuantity(0).build());
  const v = violationFor(assertValidationFailed(res), "items[0].quantity");
  assert.equal(v.expected, "integer >= 1");
  assert.equal(v.received, "0");
});

// Missing nested fields are reported with the field's own rule code, not
// "required" as for a missing top-level customerId (possible API inconsistency).
test("reports missing fulfillment fields at their nested paths", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withFulfillment({}).build());
  const violations = assertValidationFailed(res);
  assert.equal(violationFor(violations, "fulfillment.method").code, "unknown_value");
  assert.equal(violationFor(violations, "fulfillment.scheduledFor").code, "invalid_format");
});

test("reports missing item fields at their nested paths", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withItems([{}]).build());
  const violations = assertValidationFailed(res);
  assert.equal(violationFor(violations, "items[0].menuItemId").code, "unknown_value");
  assert.equal(violationFor(violations, "items[0].quantity").code, "out_of_range");
  assert.equal(violationFor(violations, "items[0].size").code, "unknown_value");
});

test("rejects an unknown fulfillment method with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withMethod("drone").build());
  const v = violationFor(assertValidationFailed(res), "fulfillment.method");
  assert.equal(v.code, "unknown_value");
  assert.deepEqual(sorted(v.allowed), sorted(fulfillmentMethods));
});

test("rejects a non-ISO scheduledFor with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withScheduledFor("tomorrow").build());
  const v = violationFor(assertValidationFailed(res), "fulfillment.scheduledFor");
  assert.equal(v.code, "invalid_format");
});

test("rejects a malformed JSON body with 400 malformed_json", TIMEOUT, async () => {
  const { status, body } = await ordersClient.createRaw(malformedOrderJson);
  assert.equal(status, 400);
  assert.equal(body.error, "malformed_json");
  assert.equal(body.message, "Request body was not valid JSON.");
  assert.equal(body.violations, undefined);
});

test("reports every violation at once for an empty body", TIMEOUT, async () => {
  const res = await ordersClient.create(emptyOrder);
  const fields = assertValidationFailed(res).map((v) => v.field);
  for (const f of ["customerId", "items", "fulfillment"]) {
    assert.ok(fields.includes(f), `expected a violation for ${f}`);
  }
});

test("reports every violation in a body that breaks two rules", TIMEOUT, async () => {
  const res = await ordersClient.create(reasonableButWrong);
  const fields = assertValidationFailed(res).map((v) => v.field);
  assert.ok(fields.includes("items[0].size"));
  assert.ok(fields.includes("fulfillment"));
});

test("rejects a valid size in lowercase with 422 because the enum is case-sensitive", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withSize("large").build());
  const v = violationFor(assertValidationFailed(res), "items[0].size");
  assert.equal(v.code, "unknown_value");
});

test("rejects a lowercase fulfillment method with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withMethod("pickup").build());
  const v = violationFor(assertValidationFailed(res), "fulfillment.method");
  assert.equal(v.code, "unknown_value");
  assert.deepEqual(sorted(v.allowed), sorted(fulfillmentMethods));
});

test("rejects a fractional quantity with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withQuantity(1.5).build());
  const v = violationFor(assertValidationFailed(res), "items[0].quantity");
  assert.equal(v.code, "out_of_range");
});

test("rejects an empty customerId with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withCustomerId("").build());
  const v = violationFor(assertValidationFailed(res), "customerId");
  assert.equal(v.code, "required");
});

test("rejects a string quantity with 422", TIMEOUT, async () => {
  const res = await ordersClient.create(anOrder().withQuantity("1").build());
  const v = violationFor(assertValidationFailed(res), "items[0].quantity");
  // The API reports a type error on quantity as out_of_range, not invalid_type (possible API defect).
  assert.equal(v.code, "out_of_range");
});

test("ignores client-supplied id, status and createdAt", TIMEOUT, async () => {
  const sent = anOrder().withServerOwnedFields(clientSuppliedServerFields).build();
  const { status, body } = await ordersClient.create(sent);
  assert.equal(status, 201);
  assert.notEqual(body.id, clientSuppliedServerFields.id);
  assert.match(body.id, /^ord_/);
  assert.equal(body.status, "PLACED");
  assert.notEqual(body.createdAt, clientSuppliedServerFields.createdAt);
  assert.ok(!Number.isNaN(Date.parse(body.createdAt)));
  assert.ok(Date.parse(body.createdAt) > Date.parse(clientSuppliedServerFields.createdAt));
});
