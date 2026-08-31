import { TAU } from '../../math/angles.js';

export { TAU as FULL_TURN, wrapAngle } from '../../math/angles.js';

export function requirePositiveFinite(owner, name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${owner} ${name} must be a positive finite number`);
  }
}

export function requireNonNegativeFinite(owner, name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${owner} ${name} must be a non-negative finite number`,
    );
  }
}

export function requireFinite(owner, name, value) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${owner} ${name} must be a finite number`);
  }
}

export function requireIntegerAtLeast(owner, name, value, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(
      `${owner} ${name} must be an integer greater than or equal to ${minimum}`,
    );
  }
}

export function requireAngularLength(owner, name, value) {
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) > TAU) {
    throw new RangeError(
      `${owner} ${name} magnitude must be greater than 0 and at most 2 * Math.PI`,
    );
  }
}

export function requireBoolean(owner, name, value) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${owner} ${name} must be a boolean`);
  }
}
