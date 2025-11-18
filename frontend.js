const TOTAL_ROWS = 32;
const TOTAL_COLUMNS = 39;
const CELL_SIZE = 20;

const LEFT = -1;
const RIGHT = 1;
const TOP = -(TOTAL_COLUMNS - 1);
const BOTTOM = (TOTAL_COLUMNS - 1);
const TOP_LEFT = LEFT + TOP;
const TOP_RIGHT = RIGHT + TOP;
const BOTTOM_LEFT = LEFT + BOTTOM;
const BOTTOM_RIGHT = RIGHT + BOTTOM;

const DIRECTIONS = [LEFT, RIGHT, TOP, BOTTOM, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT];

const LEFT_DIRECTIONS = new Set([TOP_LEFT, LEFT, BOTTOM_LEFT]);

const RIGHT_DIRECTIONS = new Set([TOP_RIGHT, RIGHT, BOTTOM_RIGHT]);

const DIRECTION_TO_UNION_MERGE_DIRECTION = new Map([
  [LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT]],
  [TOP, [BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM, [TOP_LEFT, TOP, TOP_RIGHT]],
  [TOP_LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT]],
  [TOP_RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM_LEFT, [TOP_LEFT, TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [BOTTOM_RIGHT, [TOP_RIGHT, TOP, TOP_LEFT, LEFT, BOTTOM_LEFT]]
]);

const body = document.getElementById("body");

/**
 * @type {HTMLCanvasElement}
 */
const field = document.getElementById("field");
const canvas = field.getContext("2d");

canvas.lineWidth = 1;

canvas.beginPath();

for (let r = 1; r < TOTAL_ROWS; r++) {
  canvas.moveTo(0, r * CELL_SIZE);
  canvas.lineTo(field.offsetWidth, r * CELL_SIZE);
}

for (let c = 1; c < TOTAL_COLUMNS; c++) {
  canvas.moveTo(c * CELL_SIZE, 0);
  canvas.lineTo(c * CELL_SIZE, field.offsetHeight);
}

canvas.stroke();

/**
 * @type {boolean[]}
 */
const board = [];

/**
 * @type {number[][][]}
 */
const unions = [];

/**
 * @type {number[]}
 */
const leaders = [];

/**
 * @type {boolean[]}
 */
const occupiedDots = [];

for (let r = 2; r <= TOTAL_ROWS; r++) {
  for (let c = 2; c <= TOTAL_COLUMNS; c++) {
    const dot = document.createElement("div");
    const dotId = (r - 2) * (TOTAL_COLUMNS - 1) + c - 2;
    dot.id = dotId.toString();
    dot.classList.add(
      `left-[${field.offsetLeft + 20 * (c - 1) - 4}px]`,
      `top-[${field.offsetTop + 20 * (r - 1) - 4}px]`,
      "absolute", "w-2", "h-2", "cursor-pointer",
      // "bg-white", "rounded-full", "border", "border-gray-900"
    );

    board[dotId] = false;

    dot.onclick = () => handleDotClick(dot);

    body.append(dot);
  }
}

/**
 * @param {HTMLDivElement} dot 
 */
function handleDotClick(dot) {
  const dotId = Number(dot.id);

  if (board[dotId]) return;

  board[dotId] = true;

  dot.classList.add("rounded-full", "bg-blue-700");

  let dotIsInUnion = false;

  for (let direction of DIRECTIONS) {
    if (isDirectionOutOfBorder(direction, dotId)) continue;

    const neighbor = dotId + direction;

    if (!board[neighbor]) continue;

    const leader = leaders[neighbor];

    unions[leader][neighbor].push(dotId);
    unions[leader][dotId] ??= [];
    unions[leader][dotId].push(neighbor);

    if (dotIsInUnion) continue;

    leaders[dotId] = leader;

    dotIsInUnion = true;

    for (let unionMergeDirection of DIRECTION_TO_UNION_MERGE_DIRECTION.get(direction)) {
      if (isDirectionOutOfBorder(unionMergeDirection, dotId)) continue;

      const unionToMergeNeighbor = dotId + unionMergeDirection;

      if (!board[unionToMergeNeighbor]) continue;

      const unionToMergeLeader = leaders[unionToMergeNeighbor];

      if (unionToMergeLeader === leader) continue;

      unions[unionToMergeLeader].forEach((unionItem, unionItemId) => {
        unions[leader][unionItemId] = unionItem;
        leaders[unionItemId] = leader;
      });

      delete unions[unionToMergeLeader];
    }
  }

  if (!dotIsInUnion) {
    unions[dotId] = [];
    unions[dotId][dotId] = [];
    leaders[dotId] = dotId;
  }

  console.log("unions", unions);
  console.log("leaders", leaders);

  /**
   * @type {number[][]}
   */
  const cycles = [];

  const leader = leaders[dotId];

  /**
   * @type {[number, number[]][]}
   */
  const queue = [[leader, [leader]]];

  while (queue.length !== 0) {
    /**
     * @type {[number, number[]]}
     */
    const [currentDotId, currentPath] = queue.shift();

    for (let neighbor of unions[leader][currentDotId]) {
      const indexOfNeighborInPath = currentPath.indexOf(neighbor);

      if (indexOfNeighborInPath === -1) {
        queue.push([neighbor, [...currentPath, neighbor]]);
        continue;
      }

      const cycle = currentPath.slice(indexOfNeighborInPath);
      const comparableCycle = toComparable(cycle);

      if (cycle.length > 3 && cycles.every(x => toComparable(x) !== comparableCycle)) {
        cycles.push(cycle);
      }
    }
  }

  console.log("cycles", cycles);

  /**
   * @type {[number, number, number, number]}
   */
  const extremePoints = [];

  const uniqueDotsFromCycles = new Set(
    cycles.flatMap(x => x)
  );

  for (let dot of uniqueDotsFromCycles) {
    const leftOffset = dot % (TOTAL_COLUMNS - 1);
    const topOffset = Math.trunc(dot / (TOTAL_COLUMNS - 1));
    
    if (extremePoints[0] === undefined || leftOffset < extremePoints[0]) extremePoints[0] = leftOffset;
    if (extremePoints[1] === undefined || leftOffset > extremePoints[1]) extremePoints[1] = leftOffset;
    if (extremePoints[2] === undefined || topOffset < extremePoints[2]) extremePoints[2] = topOffset;
    if (extremePoints[3] === undefined || topOffset > extremePoints[3]) extremePoints[3] = topOffset;
  }

  /**
   * @type {number[]}
   */
  const dotsWithinExtremePoints = [];

  for (let dot = 0; dot < board.length; dot++) {
    if (!board[dot]) continue;

    const leftOffset = dot % (TOTAL_COLUMNS - 1);
    const topOffset = Math.trunc(dot / (TOTAL_COLUMNS - 1));

    if (
      extremePoints[0] <= leftOffset && leftOffset <= extremePoints[1] &&
      extremePoints[2] <= topOffset && topOffset <= extremePoints[3]
    ) {
      dotsWithinExtremePoints.push(dot);
    }
  }

  /**
   * @type {number[][]}
   */
  const polygons = [];

  // TODO: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/isPointInPath - alternative to ray cast
  cyclesloop:
  for (let cycle of cycles) {
    let cycleIsInPolygons = false;

    for (let dot of dotsWithinExtremePoints) {
      if (occupiedDots[dot]) continue cyclesloop;

      if (cycle.indexOf(dot) !== -1) continue;

      let intersectionCount = 0;
      let ray = dot;

      while (ray % (TOTAL_COLUMNS - 1) <= extremePoints[1]) {
        ray++;
        const intersectionIndex = cycle.indexOf(ray);

        if (intersectionIndex === -1) continue;

        intersectionCount++;

        const intersection = cycle[intersectionIndex];
        const intersectionTopOffset = Math.trunc(intersection / (TOTAL_COLUMNS - 1));
        const beforeIntersection = cycle[(intersectionIndex - 1 + cycle.length) % cycle.length];
        const beforeIntersectionTopOffset = Math.trunc(beforeIntersection / (TOTAL_COLUMNS - 1));
        const afterIntersection = cycle[(intersectionIndex + 1) % cycle.length];
        const afterIntersectionTopOffset = Math.trunc(afterIntersection / (TOTAL_COLUMNS - 1));

        if (
          beforeIntersectionTopOffset <= intersectionTopOffset && intersectionTopOffset >= afterIntersectionTopOffset ||
          beforeIntersectionTopOffset >= intersectionTopOffset && intersectionTopOffset <= afterIntersectionTopOffset
        ) {
          intersectionCount++;
        }
      }

      if (!cycleIsInPolygons && intersectionCount % 2 === 1) {
        polygons.push(cycle);
        cycleIsInPolygons = true;
      }
    }
  }

  console.log("polygons", polygons);

  canvas.strokeStyle = "blue";
  canvas.lineWidth = 2;
  canvas.fillStyle = "rgb(0 0 255 / 40%)";

  for (let polygon of polygons) {
    const path = new Path2D();

    const x = polygon[0] % (TOTAL_COLUMNS - 1) + 1;
    const y = Math.trunc(polygon[0] / (TOTAL_COLUMNS - 1)) + 1;

    path.moveTo(x * CELL_SIZE, y * CELL_SIZE);

    for (let i = 1; i < polygon.length; i++) {
      const x = polygon[i] % (TOTAL_COLUMNS - 1) + 1;
      const y = Math.trunc(polygon[i] / (TOTAL_COLUMNS - 1)) + 1;

      path.lineTo(x * CELL_SIZE, y * CELL_SIZE);
    }

    path.lineTo(x * CELL_SIZE, y * CELL_SIZE);

    canvas.stroke(path);
    canvas.fill(path);
  }
}

/**
 * @param {number} direction
 * @param {number} dotId
 */
function isDirectionOutOfBorder(direction, dotId) {
  const dotIsOnLeftBorder = dotId % (TOTAL_COLUMNS - 1) === 0;
  const dotIsOnRightBorder = (dotId + 1) % (TOTAL_COLUMNS - 1) === 0;

  return (
    LEFT_DIRECTIONS.has(direction) && dotIsOnLeftBorder ||
    RIGHT_DIRECTIONS.has(direction) && dotIsOnRightBorder
  );
}

/**
 * @param {Array} array
 */
function toComparable(array) {
  return array
    .toSorted()
    .toString();
}