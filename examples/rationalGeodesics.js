const ZERO = Object.freeze({ numerator: 0n, denominator: 1n });
const ONE = Object.freeze({ numerator: 1n, denominator: 1n });
const TWO = Object.freeze({ numerator: 2n, denominator: 1n });
const MAX_DENOMINATOR_LIMIT = 12;

/**
 * Builds unit-disk geodesics through bounded rational points.
 *
 * Each coordinate is a unique reduced fraction p/q in (-1, 1) whose
 * denominator is at most `denominatorLimit`. Their Cartesian product is then
 * filtered by x^2 + y^2 < 1. Exact BigInt fraction arithmetic owns circle
 * identity and point incidence; conversion to Number happens only for
 * rendering. The limit is capped because the number of point pairs grows
 * rapidly; values through 8 remain suitable for this browser demo.
 */
export function createRationalGeodesicSpecs(
  denominatorLimit,
  { minimumPointCount = 3 } = {},
) {
  assertDenominatorLimit(denominatorLimit);
  if (!Number.isInteger(minimumPointCount) || minimumPointCount < 3) {
    throw new RangeError(
      'minimumPointCount must be an integer greater than or equal to 3',
    );
  }

  const coordinates = createRationalCoordinates(denominatorLimit);
  const exactPoints = createRationalPoints(coordinates);
  const candidateCircles = collectCandidateCircles(exactPoints);
  const arcs = Array.from(candidateCircles.values()).flatMap((circle) => {
    if (
      typeof circle === 'number' ||
      circle.pointIndices.size < minimumPointCount
    ) {
      return [];
    }
    return [createArcSpec(circle)];
  });
  const diameters = collectDiameters(exactPoints, minimumPointCount);
  const points = exactPoints.map(createPointSpec);
  const curvedOrderedTripleCount = countOrderedTriples(arcs);
  const diameterOrderedTripleCount = countOrderedTriples(diameters);
  const stats = Object.freeze({
    denominatorLimit,
    coordinateCount: coordinates.length,
    pointCount: points.length,
    minimumPointCount,
    candidateCircleCount: candidateCircles.size,
    underSupportedCircleCount: candidateCircles.size - arcs.length,
    curvedGeodesicCount: arcs.length,
    diameterGeodesicCount: diameters.length,
    geodesicCount: arcs.length + diameters.length,
    curvedOrderedTripleCount,
    diameterOrderedTripleCount,
    orderedTripleCount: curvedOrderedTripleCount + diameterOrderedTripleCount,
  });

  return { points, arcs, diameters, stats };
}

function countOrderedTriples(geodesics) {
  return geodesics.reduce((count, { pointIndices }) => {
    const pointCount = pointIndices.length;
    return count + pointCount * (pointCount - 1) * (pointCount - 2);
  }, 0);
}

function createRationalCoordinates(denominatorLimit) {
  const coordinates = [];

  for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
    for (
      let numerator = 1 - denominator;
      numerator < denominator;
      numerator++
    ) {
      if (greatestCommonDivisor(Math.abs(numerator), denominator) !== 1) {
        continue;
      }
      coordinates.push(createFraction(BigInt(numerator), BigInt(denominator)));
    }
  }

  return coordinates.sort(compareFractions);
}

function createRationalPoints(coordinates) {
  return coordinates.flatMap((x) =>
    coordinates.flatMap((y) => {
      const normSquared = addFractions(squareFraction(x), squareFraction(y));
      if (compareFractions(normSquared, ONE) >= 0) return [];
      return [
        {
          x,
          y,
          projection: divideFractions(addFractions(normSquared, ONE), TWO),
        },
      ];
    }),
  );
}

function collectCandidateCircles(points) {
  const circles = new Map();
  const pointCount = points.length;

  for (let firstIndex = 0; firstIndex < points.length - 1; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length;
      secondIndex++
    ) {
      const circle = orthogonalCircleThroughPair(
        points[firstIndex],
        points[secondIndex],
      );
      if (!circle) continue;

      const key = circleKey(circle.center);
      const existing = circles.get(key);
      if (existing === undefined) {
        circles.set(key, firstIndex * pointCount + secondIndex);
      } else if (typeof existing === 'number') {
        const initialFirstIndex = Math.floor(existing / pointCount);
        const initialSecondIndex = existing % pointCount;
        circles.set(key, {
          ...circle,
          pointIndices: new Set([
            initialFirstIndex,
            initialSecondIndex,
            firstIndex,
            secondIndex,
          ]),
        });
      } else {
        existing.pointIndices.add(firstIndex);
        existing.pointIndices.add(secondIndex);
      }
    }
  }

  return circles;
}

function orthogonalCircleThroughPair(first, second) {
  const determinant = subtractFractions(
    multiplyFractions(first.x, second.y),
    multiplyFractions(first.y, second.x),
  );

  // Radially collinear points belong to a diameter geodesic instead.
  if (isZeroFraction(determinant)) return null;

  // For the unit disk, orthogonality and point incidence reduce to
  // C dot point = (|point|^2 + 1) / 2. Solve the two exact linear
  // equations for the support-circle center C.
  const centerX = divideFractions(
    subtractFractions(
      multiplyFractions(first.projection, second.y),
      multiplyFractions(first.y, second.projection),
    ),
    determinant,
  );
  const centerY = divideFractions(
    subtractFractions(
      multiplyFractions(first.x, second.projection),
      multiplyFractions(first.projection, second.x),
    ),
    determinant,
  );
  return { center: [centerX, centerY] };
}

function createArcSpec(circle) {
  const center = circle.center.map(fractionToNumber);
  const centerDistance = Math.hypot(...center);
  if (!Number.isFinite(centerDistance) || centerDistance <= 1) {
    throw new Error('Failed to convert an orthogonal circle for rendering');
  }

  const inverseDistance = 1 / centerDistance;
  const unitX = center[0] * inverseDistance;
  const unitY = center[1] * inverseDistance;
  const chordOffset = inverseDistance;
  const halfChord = Math.sqrt(Math.max(0, 1 - chordOffset * chordOffset));
  const baseX = unitX * chordOffset;
  const baseY = unitY * chordOffset;
  const offsetX = -unitY * halfChord;
  const offsetY = unitX * halfChord;

  return {
    center,
    radius: Math.sqrt((centerDistance - 1) * (centerDistance + 1)),
    start: [baseX + offsetX, baseY + offsetY],
    end: [baseX - offsetX, baseY - offsetY],
    largeArc: false,
    pointIndices: Array.from(circle.pointIndices).sort(
      (first, second) => first - second,
    ),
  };
}

function collectDiameters(points, minimumPointCount) {
  const directions = new Map();
  const originIndex = points.findIndex(
    ({ x, y }) => isZeroFraction(x) && isZeroFraction(y),
  );

  for (const [pointIndex, point] of points.entries()) {
    if (pointIndex === originIndex) continue;
    const direction = canonicalDirection(point);
    const key = `${direction[0]}:${direction[1]}`;
    const existing = directions.get(key);
    if (existing) {
      existing.pointIndices.add(pointIndex);
    } else {
      directions.set(key, {
        direction,
        pointIndices: new Set([pointIndex]),
      });
    }
  }

  return Array.from(directions.values()).flatMap((record) => {
    record.pointIndices.add(originIndex);
    if (record.pointIndices.size < minimumPointCount) return [];

    const numericDirection = record.direction.map(Number);
    const length = Math.hypot(...numericDirection);
    const endpoint = numericDirection.map((value) => value / length);
    return [
      {
        direction: endpoint,
        start: endpoint.map((value) => -value),
        end: endpoint,
        pointIndices: Array.from(record.pointIndices).sort(
          (first, second) => first - second,
        ),
      },
    ];
  });
}

function canonicalDirection({ x, y }) {
  let directionX = x.numerator * y.denominator;
  let directionY = y.numerator * x.denominator;
  const divisor = greatestCommonDivisorBigInt(
    absoluteBigInt(directionX),
    absoluteBigInt(directionY),
  );
  directionX /= divisor;
  directionY /= divisor;

  if (directionX < 0n || (directionX === 0n && directionY < 0n)) {
    directionX = -directionX;
    directionY = -directionY;
  }
  return [directionX, directionY];
}

function createPointSpec({ x, y }) {
  return {
    x: serializeFraction(x),
    y: serializeFraction(y),
    position: [fractionToNumber(x), fractionToNumber(y)],
  };
}

function serializeFraction({ numerator, denominator }) {
  return {
    numerator: Number(numerator),
    denominator: Number(denominator),
  };
}

function createFraction(numerator, denominator = 1n) {
  if (denominator === 0n) {
    throw new RangeError('Fraction denominator must not be zero');
  }
  if (numerator === 0n) return ZERO;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }

  const divisor = greatestCommonDivisorBigInt(
    absoluteBigInt(numerator),
    denominator,
  );
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function addFractions(first, second) {
  return createFraction(
    first.numerator * second.denominator + second.numerator * first.denominator,
    first.denominator * second.denominator,
  );
}

function subtractFractions(first, second) {
  return createFraction(
    first.numerator * second.denominator - second.numerator * first.denominator,
    first.denominator * second.denominator,
  );
}

function multiplyFractions(first, second) {
  return createFraction(
    first.numerator * second.numerator,
    first.denominator * second.denominator,
  );
}

function divideFractions(first, second) {
  if (isZeroFraction(second)) {
    throw new RangeError('Cannot divide by a zero fraction');
  }
  return createFraction(
    first.numerator * second.denominator,
    first.denominator * second.numerator,
  );
}

function squareFraction(value) {
  return createFraction(
    value.numerator * value.numerator,
    value.denominator * value.denominator,
  );
}

function compareFractions(first, second) {
  const difference =
    first.numerator * second.denominator - second.numerator * first.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function isZeroFraction(value) {
  return value.numerator === 0n;
}

function fractionToNumber({ numerator, denominator }) {
  return Number(numerator) / Number(denominator);
}

function fractionKey({ numerator, denominator }) {
  return `${numerator}/${denominator}`;
}

function circleKey([x, y]) {
  return `${fractionKey(x)}:${fractionKey(y)}`;
}

function greatestCommonDivisor(first, second) {
  while (second !== 0) {
    [first, second] = [second, first % second];
  }
  return first;
}

function greatestCommonDivisorBigInt(first, second) {
  while (second !== 0n) {
    [first, second] = [second, first % second];
  }
  return first;
}

function absoluteBigInt(value) {
  return value < 0n ? -value : value;
}

function assertDenominatorLimit(denominatorLimit) {
  if (!Number.isSafeInteger(denominatorLimit) || denominatorLimit < 1) {
    throw new RangeError('denominatorLimit must be a positive safe integer');
  }
  if (denominatorLimit > MAX_DENOMINATOR_LIMIT) {
    throw new RangeError(
      `denominatorLimit must not exceed ${MAX_DENOMINATOR_LIMIT} for this demo`,
    );
  }
}
