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
const occupiedDots = [];

/**
 * @type {number[][][]}
 */
const unions = [];

/**
 * @type {number[]}
 */
const leaders = [];

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

    occupiedDots[dotId] = false;

    dot.onclick = () => handleDotClick(dot);

    body.append(dot);
  }
}

/**
 * @param {HTMLDivElement} dot 
 */
function handleDotClick(dot) {
  const dotId = Number(dot.id);

  if (occupiedDots[dotId]) return;

  occupiedDots[dotId] = true;

  dot.classList.add("rounded-full", "bg-blue-700");

  let dotIsInUnion = false;

  for (let direction of DIRECTIONS) {
    if (isDirectionOutOfBorder(direction, dotId)) continue;

    const neighbor = dotId + direction;

    if (!occupiedDots[neighbor]) continue;

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

      if (!occupiedDots[unionToMergeNeighbor]) continue;

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
      const normalizedCycle = normalizeCycle(cycle);

      if (cycle.length > 2 && cycles.every(x => normalizeCycle(x) !== normalizedCycle)) {
        cycles.push(cycle);
      }
    }
  }

  console.log("cycles", cycles);
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
 * @param {number[]} cycle 
 */
function normalizeCycle(cycle) {
  return cycle
    .toSorted()
    .toString();
}