import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareQuantityStepper, stepQuantity } from '../src/features/quantity-stepper/quantity-stepper.service';

test('honours supplied lower and upper limits during repeated changes', () => {
  let quantity = prepareQuantityStepper({ value: 2, min: 2, max: 4 });
  assert.equal(quantity.canDecrease, false);
  for (let i = 0; i < 20; i++) quantity = stepQuantity(quantity, 1);
  assert.equal(quantity.value, 4);
  assert.equal(quantity.canIncrease, false);
  assert.equal(quantity.canDecrease, true);
  for (let i = 0; i < 20; i++) quantity = stepQuantity(quantity, -1);
  assert.equal(quantity.value, 2);
  assert.equal(quantity.canIncrease, true);
});

test('zero is accepted only when the caller supplies a range containing it', () => {
  const quantity = prepareQuantityStepper({ value: 0, min: 0, max: 3 });
  assert.equal(stepQuantity(quantity, -1).value, 0);
  assert.equal(stepQuantity(quantity, 1).value, 1);
  assert.throws(() => prepareQuantityStepper({ value: 0, min: 1, max: 3 }), RangeError);
});

test('fixed and disabled quantities cannot change', () => {
  for (const input of [{ value: 2, min: 2, max: 2 }, { value: 3, min: 1, max: 8, disabled: true }]) {
    const quantity = prepareQuantityStepper(input);
    assert.equal(quantity.canDecrease, false);
    assert.equal(quantity.canIncrease, false);
    assert.equal(stepQuantity(quantity, -1).value, input.value);
    assert.equal(stepQuantity(quantity, 1).value, input.value);
  }
});

test('rejects invalid numeric inputs and inconsistent limits without silently changing values', () => {
  for (const field of ['value', 'min', 'max']) {
    for (const invalid of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => prepareQuantityStepper({ value: 2, min: 1, max: 4, [field]: invalid }), RangeError);
    }
  }
  for (const input of [{ value: 3, min: 4, max: 2 }, { value: 5, min: 1, max: 4 }]) {
    assert.throws(() => prepareQuantityStepper(input), RangeError);
  }
});

test('stepping does not mutate supplied state or exceed safe integer bounds', () => {
  const original = prepareQuantityStepper({ value: Number.MAX_SAFE_INTEGER - 1, min: 0, max: Number.MAX_SAFE_INTEGER });
  const next = stepQuantity(original, 1);
  assert.equal(original.value, Number.MAX_SAFE_INTEGER - 1);
  assert.equal(next.value, Number.MAX_SAFE_INTEGER);
  assert.equal(stepQuantity(next, 1).value, Number.MAX_SAFE_INTEGER);
});
