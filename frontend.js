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

const LEFT_DIRECTIONS = [TOP_LEFT, LEFT, BOTTOM_LEFT];

const RIGHT_DIRECTIONS = [TOP_RIGHT, RIGHT, BOTTOM_RIGHT];

const AXIS_DIRECTIONS = [LEFT, RIGHT, TOP, BOTTOM];

const DIAGONAL_DIRECTIONS = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT];

const DIRECTION_TO_UNION_MERGE_DIRECTIONS = new Map([
  [LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT]],
  [TOP, [BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM, [TOP_LEFT, TOP, TOP_RIGHT]],
  [TOP_LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT]],
  [TOP_RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM_LEFT, [TOP_LEFT, TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [BOTTOM_RIGHT, [TOP_RIGHT, TOP, TOP_LEFT, LEFT, BOTTOM_LEFT]]
]);

const DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS = new Map([
  [TOP_LEFT, [TOP, LEFT]],
  [TOP_RIGHT, [TOP, RIGHT]],
  [BOTTOM_LEFT, [BOTTOM, LEFT]],
  [BOTTOM_RIGHT, [BOTTOM, RIGHT]]
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
 * @type {Set<number>}
 */
const occupiedDots = new Set();

/**
 * @type {number[][]}
 */
const polygons = [];

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

    for (let unionMergeDirection of DIRECTION_TO_UNION_MERGE_DIRECTIONS.get(direction)) {
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

  const leader = leaders[dotId];

  /**
   * @type {[number, number, number, number]}
   */
  const extremePoints = [];

  for (let dot = 0; dot < unions[leader].length; dot++) {
    if (!unions[leader][dot]) continue;

    const leftOffset = dot % (TOTAL_COLUMNS - 1);
    const topOffset = Math.trunc(dot / (TOTAL_COLUMNS - 1));
    
    if (extremePoints[0] === undefined || leftOffset < extremePoints[0]) extremePoints[0] = leftOffset;
    if (extremePoints[1] === undefined || leftOffset > extremePoints[1]) extremePoints[1] = leftOffset;
    if (extremePoints[2] === undefined || topOffset < extremePoints[2]) extremePoints[2] = topOffset;
    if (extremePoints[3] === undefined || topOffset > extremePoints[3]) extremePoints[3] = topOffset;
  }

  console.log("extreme points", extremePoints);

  /**
   * @type {number[]}
   */
  const unoccupiedDotsWithinExtremePoints = [];

  for (let dot = 0; dot < board.length; dot++) {
    if (
      !board[dot] || occupiedDots.has(dot)
      // uncomment once dots distinction is implemented
      // || leaders[dot] === leader
    ) continue;

    const leftOffset = dot % (TOTAL_COLUMNS - 1);
    const topOffset = Math.trunc(dot / (TOTAL_COLUMNS - 1));

    if (
      extremePoints[0] <= leftOffset && leftOffset <= extremePoints[1] &&
      extremePoints[2] <= topOffset && topOffset <= extremePoints[3]
    ) {
      unoccupiedDotsWithinExtremePoints.push(dot);
    }
  }

  console.log("unoccupied dots within extreme points", unoccupiedDotsWithinExtremePoints);

  /**
   * @type {number[][]}
   */
  const newPolygons = [];

  outer:
  for (let dot of unoccupiedDotsWithinExtremePoints) {
    for (let polygon of newPolygons) {
      const [intersectionCount, _] = raycast(dot, polygon, RIGHT, extremePoints[1]);

      if (intersectionCount % 2 == 1) {
        occupiedDots.add(dot);
        continue outer; 
      }
    }

    /**
     * @type {number[]}
     */
    const polygon = [];

    /**
     * @type {number[]}
     */
    const stack = [dot];

    /**
     * @type {Set<number>}
     */
    const visited = new Set([dot]);

    while (stack.length > 0) {
      const currentDot = stack.pop();
      visited.add(currentDot);

      if (
        leaders[currentDot] === leader
        // probably remove once dots distinction is implemented
        && currentDot !== dot
      ) {
        polygon.push(currentDot);
        continue;
      }

      const leftOffset = currentDot % (TOTAL_COLUMNS - 1);
      const topOffset = Math.trunc(currentDot / (TOTAL_COLUMNS - 1));

      if (
        leftOffset === extremePoints[0] || leftOffset === extremePoints[1] ||
        topOffset === extremePoints[2] || leftOffset === extremePoints[3]
      ) {
        continue outer;
      }

      for (let direction of AXIS_DIRECTIONS) {
        if (!visited.has(currentDot + direction)) {
          stack.push(currentDot + direction);
        }
      }

      for (let direction of DIAGONAL_DIRECTIONS) {
        if (
          DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS.get(direction).some(x => leaders[currentDot + x] !== leader) &&
          !visited.has(currentDot + direction)
        ) {
          stack.push(currentDot + direction);
        }
      }
    }

    occupiedDots.add(dot);
    newPolygons.push(polygon);
  }

  polygons.push(...newPolygons);

  console.log("occupied dots", occupiedDots);
  console.log("polygons", polygons);

  // /**
  //  * @type {number[][]}
  //  */
  // const cycles = [];

  // /**
  //  * @type {[number, number[]][]}
  //  */
  // const queue = [[leader, [leader]]];

  // while (queue.length !== 0) {
  //   /**
  //    * @type {[number, number[]]}
  //    */
  //   const [currentDotId, currentPath] = queue.shift();

  //   for (let neighbor of unions[leader][currentDotId]) {
  //     if (occupiedDots.has(neighbor)) continue;

  //     const indexOfNeighborInPath = currentPath.indexOf(neighbor);

  //     if (indexOfNeighborInPath === -1) {
  //       queue.push([neighbor, [...currentPath, neighbor]]);
  //       continue;
  //     }

  //     const cycle = currentPath.slice(indexOfNeighborInPath);
  //     const comparableCycle = toComparable(cycle);

  //     if (cycle.length > 3 && cycles.every(x => toComparable(x) !== comparableCycle)) {
  //       cycles.push(cycle);
  //     }
  //   }
  // }

  // console.log("cycles", cycles);

  // /**
  //  * @type {number[]}
  //  */
  // let mainPolygon = undefined;

  // /**
  //  * @type {number[]}
  //  */
  // let adjacentPolygon = undefined;
  // let skipAdjacentPolygon = false;

  // /**
  //  * @type {Set<number>}
  //  */
  // const eventuallyOccupiedDots = new Set();

  // cyclesloop:
  // for (let cycle of cycles) {
  //   for (let existingPolygon of polygons.filter(x => x.some(dot => cycle.includes(dot)))) {
  //     for (let i = 0; i < cycle.length; i++) {
  //       const intersectionIndex = existingPolygon.indexOf(cycle[i]);

  //       if (intersectionIndex === -1) continue;

  //       const nextDotInCycle = cycle[(i + 1) % cycle.length];
  //       const beforeIntersection = existingPolygon[(intersectionIndex - 1 + existingPolygon.length) % existingPolygon.length];
  //       const afterIntersection = existingPolygon[(intersectionIndex + 1) % existingPolygon.length];

  //       if (
  //         nextDotInCycle !== beforeIntersection &&
  //         nextDotInCycle !== afterIntersection &&
  //         existingPolygon.includes(nextDotInCycle)
  //       ) {
  //         continue cyclesloop;
  //       }
  //     }
  //   }

  //   let occupiedDotsCount = 0;

  //   for (let dot of unoccupiedDotsWithinExtremePoints) {
  //     if (cycle.includes(dot)) continue;

  //     const [intersectionCount, _] = raycast(dot, cycle, RIGHT, extremePoints[1]);

  //     if (intersectionCount % 2 === 0) continue;

  //     occupiedDotsCount++;

  //     if (occupiedDots.has(dot)) continue cyclesloop;

  //     eventuallyOccupiedDots.add(dot);
  //   }

  //   if (occupiedDotsCount === 0) continue;

  //   const sharedDotsCount = mainPolygon?.filter(x => cycle.includes(x)).length;

  //   if (
  //     // first detected main polygon
  //     mainPolygon === undefined ||
  //     // cycle is a superset of main polygon => replace main polygon with a new one
  //     sharedDotsCount > 1 && cycle.length > mainPolygon.length
  //   ) {
  //     mainPolygon = cycle;
  //     continue;
  //   }

  //   // cycle is an adjacent polygon connected to main polygon by exactly 1 dot,
  //   // which is currently clicked dot
  //   if (sharedDotsCount === 1 && !skipAdjacentPolygon) {
  //     const figure = [
  //       ...mainPolygon.toSpliced(mainPolygon.indexOf(dotId), 1),
  //       ...cycle.toSpliced(cycle.indexOf(dotId), 1)
  //     ];

  //     const [rayDirection, rayBorder] = [mainPolygon, cycle].some(x => x.includes(dotId + TOP_RIGHT) && x.includes(dotId + BOTTOM_RIGHT))
  //       ? [RIGHT, extremePoints[1]]
  //       : [TOP, extremePoints[2]];

  //     const [intersectionCount, lastIntersection] = raycast(dotId, figure, rayDirection, rayBorder);

  //     // adjacent polygon and main polygon are on the same side of connection dot
  //     if (intersectionCount % 2 === 0) {
  //       // mark all remaining variations of adjacent polygon as skipped
  //       skipAdjacentPolygon = true
        
  //       // replace main polygon with a new one if it was intersected last
  //       if (cycle.includes(lastIntersection)) {
  //         mainPolygon = cycle;
  //       }
        
  //       continue;
  //     }
      
  //     // adjacent polygon and main polygon are on different sides of connection dot
  //     if (
  //       // first detected adjacent polygon
  //       adjacentPolygon === undefined ||
  //       // cycle is a superset of main polygon => replace main polygon with a new one
  //       // note: number of shared points between cycle and adjacentPolygon always > 1,
  //       // so calculating number of shared dots between cycle and adjacentPolygon is redundant
  //       cycle.length > adjacentPolygon.length
  //     ) {
  //       adjacentPolygon = cycle;
  //       continue;
  //     }
  //   }
  // }

  // eventuallyOccupiedDots.forEach(x => occupiedDots.add(x));

  // console.log("occupied dots", eventuallyOccupiedDots);
  // console.log("main polygon", mainPolygon);
  // console.log("adjacent polygon", adjacentPolygon);

  // canvas.strokeStyle = "blue";
  // canvas.lineWidth = 2;
  // canvas.fillStyle = "rgb(0 0 255 / 40%)";

  // for (let polygon of [mainPolygon, adjacentPolygon]) {
  //   if (polygon === undefined) continue;

  //   polygons.push(polygon);

  //   const path = new Path2D();

  //   const x = polygon[0] % (TOTAL_COLUMNS - 1) + 1;
  //   const y = Math.trunc(polygon[0] / (TOTAL_COLUMNS - 1)) + 1;

  //   path.moveTo(x * CELL_SIZE, y * CELL_SIZE);

  //   for (let i = 1; i < polygon.length; i++) {
  //     const x = polygon[i] % (TOTAL_COLUMNS - 1) + 1;
  //     const y = Math.trunc(polygon[i] / (TOTAL_COLUMNS - 1)) + 1;

  //     path.lineTo(x * CELL_SIZE, y * CELL_SIZE);
  //   }

  //   path.lineTo(x * CELL_SIZE, y * CELL_SIZE);

  //   canvas.stroke(path);
  //   canvas.fill(path);
  // }
}

/**
 * @param {number} dot
 * @param {number[]} figure
 * @param {number} direction
 * @param {number} border
 * @returns {[number, number]}
 */
function raycast(dot, figure, direction, border) {
  let intersectionCount = 0;
  let lastIntersection = -1;
  let ray = dot;

  /**
   * @type {[(ray: number) => boolean, (intersection: number) => number]}
   */
  const [borderCheck, getOffset] = direction === RIGHT
    ? [x => x % (TOTAL_COLUMNS - 1) < border, x => Math.trunc(x / (TOTAL_COLUMNS - 1))]
    : [x => Math.trunc(x / (TOTAL_COLUMNS - 1)) > border, x => x % (TOTAL_COLUMNS - 1)];

  while (borderCheck(ray)) {
    ray += direction;
    const intersectionIndex = figure.indexOf(ray);

    if (intersectionIndex === -1) continue;

    intersectionCount++;

    const intersection = figure[intersectionIndex];
    const shiftedIntersectionOffset = getOffset(intersection) - 0.1;
    const beforeIntersection = figure[(intersectionIndex - 1 + figure.length) % figure.length];
    const beforeIntersectionOffset = getOffset(beforeIntersection);
    const afterIntersection = figure[(intersectionIndex + 1) % figure.length];
    const afterIntersectionOffset = getOffset(afterIntersection);

    // up/left shifted ray is above/to the left of both adjacent points => no intersection
    if (beforeIntersectionOffset > shiftedIntersectionOffset && shiftedIntersectionOffset < afterIntersectionOffset) {
      intersectionCount--;
    }

    // up/left shifted ray is below/to the right of both adjacent points => 2 intersections
    if (beforeIntersectionOffset < shiftedIntersectionOffset && shiftedIntersectionOffset > afterIntersectionOffset) {
      intersectionCount++;
    }
  }

  return [intersectionCount, lastIntersection];
}

/**
 * @param {number} direction
 * @param {number} dotId
 */
function isDirectionOutOfBorder(direction, dotId) {
  const dotIsOnLeftBorder = dotId % (TOTAL_COLUMNS - 1) === 0;
  const dotIsOnRightBorder = (dotId + 1) % (TOTAL_COLUMNS - 1) === 0;

  return (
    LEFT_DIRECTIONS.includes(direction) && dotIsOnLeftBorder ||
    RIGHT_DIRECTIONS.includes(direction) && dotIsOnRightBorder
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