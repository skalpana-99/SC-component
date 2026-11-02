import type { QuantityStepperData, QuantityStepperInput } from './quantity-stepper.types';

export function prepareQuantityStepper(input: QuantityStepperInput): QuantityStepperData {
  const { value, min, max } = input;
  if (![value, min, max].every((number) => Number.isSafeInteger(number) && number >= 0)) {
    throw new RangeError('Quantity, minimum and maximum must be nonnegative safe integers.');
  }
  if (min > max) throw new RangeError('Minimum quantity must not exceed maximum quantity.');
  if (value < min || value > max) throw new RangeError('Initial quantity must be within the supplied limits.');

  const disabled = input.disabled ?? false;
  return {
    value, min, max, disabled,
    canDecrease: !disabled && value > min,
    canIncrease: !disabled && value < max,
  };
}

export function stepQuantity(quantity: QuantityStepperData, direction: -1 | 1): QuantityStepperData {
  if (direction === -1 ? !quantity.canDecrease : !quantity.canIncrease) return quantity;
  return prepareQuantityStepper({ ...quantity, value: quantity.value + direction });
}
