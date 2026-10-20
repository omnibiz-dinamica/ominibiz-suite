import assert from "node:assert/strict";
import test from "node:test";
import { manuallyResolvedClientAddress, resolveClientLocationForSave } from "../src/lib/client-location-save.ts";

const oldPoint = { lat: 38.7, lng: -9.1, address: "Lisboa", radiusM: 50 };

test("waits for the new address point rather than saving the old location", async () => {
  let location = oldPoint;
  let resolvedAddress = "Lisboa";
  let finish = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let saved = false;
  const saving = resolveClientLocationForSave({
    address: "Bruxelas",
    getLocation: () => location,
    getResolvedAddress: () => resolvedAddress,
    geocode: async () => {
      await pending;
      location = { ...oldPoint, lat: 50.85, lng: 4.35, address: "Bruxelas" };
      resolvedAddress = "Bruxelas";
    },
  }).then((value) => { saved = true; return value; });
  await Promise.resolve();
  assert.equal(saved, false);
  finish();
  assert.deepEqual(await saving, { ...oldPoint, lat: 50.85, lng: 4.35, address: "Bruxelas" });
});

test("failed geocoding cannot persist old coordinates with a changed address", async () => {
  await assert.rejects(resolveClientLocationForSave({
    address: "Bruxelas", getLocation: () => oldPoint,
    getResolvedAddress: () => "Lisboa", geocode: async () => null,
  }), /Não foi possível confirmar/);
});

test("unchanged address preserves a manually positioned point and radius", async () => {
  const manual = { ...oldPoint, lat: 38.71, radiusM: 100 };
  assert.deepEqual(await resolveClientLocationForSave({
    address: " Lisboa ", getLocation: () => manual,
    getResolvedAddress: () => "Lisboa", geocode: async () => { throw new Error("must not geocode"); },
  }), manual);
});

test("removing the address clears its old point", async () => {
  assert.deepEqual(await resolveClientLocationForSave({
    address: " ", getLocation: () => oldPoint,
    getResolvedAddress: () => "Lisboa", geocode: async () => null,
  }), { ...oldPoint, lat: null, lng: null, address: null });
});

test("reverse-geocoded map address preserves the exact manual pin without forward geocoding", async () => {
  const pin = { ...oldPoint, lat: 50.850123, lng: 4.350456 };
  let resolvedAddress = manuallyResolvedClientAddress(oldPoint, pin, "Lisboa");
  assert.equal(resolvedAddress, "Lisboa");
  const reverseResult = { ...pin, address: "Bruxelas, entrada lateral" };
  resolvedAddress = manuallyResolvedClientAddress(pin, reverseResult, "Lisboa");
  assert.equal(resolvedAddress, "Bruxelas, entrada lateral");
  let geocodeCalls = 0;
  const saved = await resolveClientLocationForSave({
    address: reverseResult.address,
    getLocation: () => reverseResult,
    getResolvedAddress: () => resolvedAddress,
    geocode: async () => { geocodeCalls += 1; throw new Error("address cannot be forward geocoded"); },
  });
  assert.deepEqual(saved, reverseResult);
  assert.equal(geocodeCalls, 0);
});

test("radius-only changes do not confirm a newly typed address against the old point", async () => {
  const typed = { ...oldPoint, address: "Bruxelas" };
  const radiusEdit = { ...typed, radiusM: 100 };
  assert.equal(manuallyResolvedClientAddress(typed, radiusEdit, "Bruxelas"), null);
  await assert.rejects(resolveClientLocationForSave({
    address: "Bruxelas", getLocation: () => radiusEdit,
    getResolvedAddress: () => "Lisboa", geocode: async () => null,
  }), /Não foi possível confirmar/);
});

test("incomplete manual coordinates cannot confirm an address", () => {
  assert.equal(manuallyResolvedClientAddress(oldPoint, { ...oldPoint, lat: null }, "Lisboa"), null);
});