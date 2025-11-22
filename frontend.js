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

/**
 * @type {HTMLCanvasElement}
 */
const field = document.getElementById("field");
const canvas = field.getContext("2d");

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

drawField();
drawDots();

function drawField() {
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
}

function drawDots() {
  const body = document.getElementById("body");

  for (let r = 2; r <= TOTAL_ROWS; r++) {
    for (let c = 2; c <= TOTAL_COLUMNS; c++) {
      const dotElement = document.createElement("div");
      const dot = (r - 2) * (TOTAL_COLUMNS - 1) + c - 2;

      dotElement.id = dot.toString();
      dotElement.classList.add(
        `left-[${field.offsetLeft + CELL_SIZE * (c - 1) - 4}px]`,
        `top-[${field.offsetTop + CELL_SIZE * (r - 1) - 4}px]`,
        "absolute", "w-2", "h-2", "cursor-pointer",
        // "bg-white", "rounded-full", "border", "border-gray-900"
      );
  
      board[dot] = false;
  
      dotElement.onclick = () => handleDotClick(dotElement);
  
      body.append(dotElement);
    }
  }
}

/**
 * @param {HTMLDivElement} dotElement 
 */
function handleDotClick(dotElement) {
  const dot = Number(dotElement.id);

  if (board[dot]) return;

  board[dot] = true;

  dotElement.classList.add("rounded-full", "bg-blue-700");

  addDotToUnion(dot);

  console.log("unions", unions);
  console.log("leaders", leaders);

  const leader = leaders[dot];

  const extremePoints = getExtremePoints(
    unions[leader]
      .map(/**@returns {[number[], number]} */ (x, i) => [x, i])
      .filter(x => x)
      .map(([_, i]) => i)
  );

  console.log("extreme points", extremePoints);

  /**
   * @type {number[]}
   */
  const unoccupiedDotsWithinExtremePoints = getDotsWithinExtremePoints(
    extremePoints,
    dot => board[dot] && !occupiedDots.has(dot)
      // uncomment once dots distinction is implemented
      // && leaders[dot] !== leader
  );

  if (unoccupiedDotsWithinExtremePoints.length === 0) return;

  console.log("unoccupied dots within extreme points", unoccupiedDotsWithinExtremePoints);

  const polygons = detectPolygons(unoccupiedDotsWithinExtremePoints, extremePoints, dot, leader);
  
  if (polygons.length === 0) return;

  console.log("occupied dots", occupiedDots);
  console.log("polygons", polygons);

  drawPolygons(polygons, canvas);
}

/**
 * @param {number} dot
 */
function addDotToUnion(dot) {
  let dotIsInUnion = false;

  for (let direction of DIRECTIONS) {
    if (isDirectionOutOfBorder(direction, dot)) continue;

    const neighbor = dot + direction;

    if (!board[neighbor]) continue;

    const leader = leaders[neighbor];

    unions[leader][neighbor].push(dot);
    unions[leader][dot] ??= [];
    unions[leader][dot].push(neighbor);

    if (dotIsInUnion) continue;

    leaders[dot] = leader;

    dotIsInUnion = true;

    for (let unionMergeDirection of DIRECTION_TO_UNION_MERGE_DIRECTIONS.get(direction)) {
      if (isDirectionOutOfBorder(unionMergeDirection, dot)) continue;

      const unionToMergeNeighbor = dot + unionMergeDirection;

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
    unions[dot] = [];
    unions[dot][dot] = [];
    leaders[dot] = dot;
  }
}

/**
 * @param {number[]} figure
 */
function getExtremePoints(figure) {
  /**
   * @type {[number, number, number, number]}
   */
  const extremePoints = [];

  for (let dot of figure) {
    const [leftOffset, topOffset] = getOffsets(dot);
    
    if (extremePoints[0] === undefined || leftOffset < extremePoints[0]) extremePoints[0] = leftOffset;
    if (extremePoints[1] === undefined || leftOffset > extremePoints[1]) extremePoints[1] = leftOffset;
    if (extremePoints[2] === undefined || topOffset < extremePoints[2]) extremePoints[2] = topOffset;
    if (extremePoints[3] === undefined || topOffset > extremePoints[3]) extremePoints[3] = topOffset;
  }

  return extremePoints;
}

/**
 * @param {[number, number, number, number]} extremePoints
 * @param {(dot: number) => boolean} predicate
 */
function getDotsWithinExtremePoints(extremePoints, predicate) {
  /**
   * @type {number[]}
   */
  const dotsWithinExtremePoints = [];

  for (let dot = 0; dot < board.length; dot++) {
    if (!predicate(dot)) continue;

    const [leftOffset, topOffset] = getOffsets(dot);

    if (
      extremePoints[0] <= leftOffset && leftOffset <= extremePoints[1] &&
      extremePoints[2] <= topOffset && topOffset <= extremePoints[3]
    ) {
      dotsWithinExtremePoints.push(dot);
    }
  }

  return dotsWithinExtremePoints
}

/**
 * @param {number[]} innerDots
 * @param {[number, number, number, number]} extremePoints
 * @param {number} dot
 * @param {number} unionLeader
 */
function detectPolygons(innerDots, extremePoints, dot, unionLeader) {
  /**
   * @type {number[][]}
   */
  const polygons = [];

  outer:
  for (let startDot of innerDots) {
    for (let polygon of polygons) {
      const intersectionCount = raycast(startDot, polygon, extremePoints[1]);

      if (intersectionCount % 2 == 1) {
        occupiedDots.add(startDot);
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
    const stack = [startDot];

    /**
     * @type {Set<number>}
     */
    const visited = new Set([startDot]);

    while (stack.length > 0) {
      const currentDot = stack.pop();

      if (
        leaders[currentDot] === unionLeader
        // probably remove once dots distinction is implemented
        && currentDot !== startDot
      ) {
        polygon.push(currentDot);
        continue;
      }

      const [leftOffset, topOffset] = getOffsets(currentDot);

      if (
        leftOffset === extremePoints[0] || leftOffset === extremePoints[1] ||
        topOffset === extremePoints[2] || topOffset === extremePoints[3]
      ) {
        continue outer;
      }

      for (let direction of AXIS_DIRECTIONS) {
        if (!visited.has(currentDot + direction)) {
          stack.push(currentDot + direction);
          visited.add(currentDot + direction);
        }
      }

      for (let direction of DIAGONAL_DIRECTIONS) {
        if (
          DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS.get(direction).some(x => leaders[currentDot + x] !== unionLeader) &&
          !visited.has(currentDot + direction)
        ) {
          stack.push(currentDot + direction);
          visited.add(currentDot + direction);
        }
      }
    }

    occupiedDots.add(startDot);
    polygons.push(reorderPolygon(polygon, dot, unionLeader));
  }

  return polygons;
}

/**
 * @param {number[]} polygon
 * @param {number} dot
 * @param {number} unionLeader
 * @example
 * unions[leader] =
 * [
 *   [0] = [1, 2, 3, 5],
 *   [1] = [0, 4, 6],
 *   [4] = [1, 2, 7],
 *   [2] = [0, 4, 8]
 * ]
 * polygon = [4, 1, 2, 0], dot = 0
 * polygon = [0, 1, 2, 4]
 * polygon = [0, 1, 2, 4]
 * polygon = [0, 1, 4, 2]
 */
function reorderPolygon(polygon, dot, unionLeader) {
  let pointer = dot;
  let replaceIndex = polygon.indexOf(pointer);

  for (let i = 0; i < polygon.length - 1; i++) {
    [polygon[i], polygon[replaceIndex]] = [pointer, polygon[i]];
    pointer = unions[unionLeader][pointer].find(x => polygon.includes(x) && polygon.indexOf(x) > i);
    replaceIndex = polygon.indexOf(pointer);
  }

  return polygon;
}

/**
 * @param {number[][]} polygons
 * @param {CanvasRenderingContext2D} canvas
 */
function drawPolygons(polygons, canvas) {
  canvas.strokeStyle = "blue";
  canvas.lineWidth = 2;
  canvas.fillStyle = "rgb(0 0 255 / 40%)";

  for (let polygon of polygons) {
    const path = new Path2D();

    const [x, y] = getOffsets(polygon[0]).map(x => x + 1);    
    path.moveTo(x * CELL_SIZE, y * CELL_SIZE);
    
    for (let i = 1; i < polygon.length; i++) {
      const [x, y] = getOffsets(polygon[i]).map(x => x + 1);
      path.lineTo(x * CELL_SIZE, y * CELL_SIZE);
    }

    path.lineTo(x * CELL_SIZE, y * CELL_SIZE);

    canvas.stroke(path);
    canvas.fill(path);
  }
}

/**
 * @param {number} dot
 * @param {number[]} figure
 * @param {number} rightBorder
 */
function raycast(dot, figure, rightBorder) {
  let intersectionCount = 0;
  let ray = dot;

  while (ray % (TOTAL_COLUMNS - 1) < rightBorder) {
    ray += RIGHT;
    const intersectionIndex = figure.indexOf(ray);

    if (intersectionIndex === -1) continue;

    intersectionCount++;

    const intersection = figure[intersectionIndex];
    const liftedIntersectionTopOffset = getOffsets(intersection)[1] - 0.1;
    const beforeIntersection = figure[(intersectionIndex - 1 + figure.length) % figure.length];
    const beforeIntersectionTopOffset = getOffsets(beforeIntersection)[1];
    const afterIntersection = figure[(intersectionIndex + 1) % figure.length];
    const afterIntersectionTopOffset = getOffsets(afterIntersection)[1];

    // raised ray is above both adjacent points => no intersection
    if (beforeIntersectionTopOffset > liftedIntersectionTopOffset && liftedIntersectionTopOffset < afterIntersectionTopOffset) {
      intersectionCount--;
    }

    // raised ray is below both adjacent points => 2 intersections
    if (beforeIntersectionTopOffset < liftedIntersectionTopOffset && liftedIntersectionTopOffset > afterIntersectionTopOffset) {
      intersectionCount++;
    }
  }

  return intersectionCount;
}

/**
 * @param {number} direction
 * @param {number} dot
 */
function isDirectionOutOfBorder(direction, dot) {
  const dotIsOnLeftBorder = getOffsets(dot)[0] === 0;
  const dotIsOnRightBorder = getOffsets(dot + 1)[0] === 0;

  return (
    LEFT_DIRECTIONS.includes(direction) && dotIsOnLeftBorder ||
    RIGHT_DIRECTIONS.includes(direction) && dotIsOnRightBorder
  );
}

/**
 * @param {number} dot
 * @returns {[number, number]}
 */
function getOffsets(dot) {
  return [
    // left
    dot % (TOTAL_COLUMNS - 1),
    // top
    Math.trunc(dot / (TOTAL_COLUMNS - 1))
  ];
}