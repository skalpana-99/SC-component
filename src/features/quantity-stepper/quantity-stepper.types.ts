export interface QuantityLimits {
  min: number;
  max: number;
}

export interface QuantityStepperInput extends QuantityLimits {
  value: number;
  disabled?: boolean;
}

export interface QuantityStepperData extends QuantityLimits {
  value: number;
  disabled: boolean;
  canDecrease: boolean;
  canIncrease: boolean;
}

export interface QuantityStepperProps {
  id: string;
  quantity: QuantityStepperData;
  label?: string;
  name?: string;
}

export interface QuantityChangeDetail {
  value: number;
}
