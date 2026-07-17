/** Validates the fixed number of instance records allocated on the CPU/GPU. */
export function validateInstanceCapacity(capacity, owner) {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError(
      `${owner} capacity must be a non-negative integer; received ${String(capacity)}`,
    );
  }
  return capacity;
}

/** Validates how many records from the fixed allocation are currently active. */
export function validateInstanceCount(count, capacity, owner) {
  if (!Number.isInteger(count) || count < 0 || count > capacity) {
    throw new RangeError(
      `${owner}.count must be an integer from 0 to capacity (${capacity}); received ${String(count)}`,
    );
  }
  return count;
}

/** Validates an instance-data index against the allocation, not the active count. */
export function validateInstanceIndex(index, capacity, owner) {
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    const range = capacity === 0
      ? 'no indices are available when capacity is 0'
      : `expected an integer from 0 to ${capacity - 1}`;
    throw new RangeError(
      `${owner} instance index is out of range (${range}); received ${String(index)}`,
    );
  }
  return index;
}
