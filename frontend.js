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

const PLAYERS_METADATA = [
  { strokeStyle: "blue", fillStyle: "rgb(0 0 255 / 40%)", dotColor: "bg-blue-500", textColor: "text-blue-500" },
  { strokeStyle: "red", fillStyle: "rgb(255 0 0 / 40%)", dotColor: "bg-red-500", textColor: "text-red-500" },
  { strokeStyle: "green", fillStyle: "rgb(0 255 0 / 40%)", dotColor: "bg-green-500", textColor: "text-green-500" },
  { strokeStyle: "yellow", fillStyle: "rgb(255 255 0 / 40%)", dotColor: "bg-yellow-500", textColor: "text-yellow-500" }
];

const state = {
  playerId: -1,
  isTurn: false,
  score: 0
};

/**
 * @type {HTMLCanvasElement}
 */
const field = document.getElementById("field");
const canvas = field.getContext("2d");

const players = document.getElementById("players");

const startButton = document.getElementById("start-button");

const logs = document.getElementById("logs");

/**
 * @type {number[]}
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

const gameHubConnection = new window.signalR.HubConnectionBuilder()
  .withUrl("/gamehub", {
    skipNegotiation: true,
    transport: 1
  })
  .withAutomaticReconnect()
  .build();

gameHubConnection.on(
  "ReceivePlayerId",
  /**
   * @param {number} playerId
   */
  (playerId) => {
    console.log("ReceivePlayerId", playerId);

    for (let i = 0; i <= playerId; i++) {
      const player = createPlayer(i, i === playerId);
      players.append(player);
    }

    state.playerId = playerId;    
  }
);

gameHubConnection.on(
  "ReceiveNewPlayerId",
  /**
   * @param {number} newPlayerId
   */
 (newPlayerId) => {
    console.log("ReceiveNewPlayerId", newPlayerId);

    const player = createPlayer(newPlayerId, false);
    players.append(player);
  }
);

gameHubConnection.on(
  "HandleGameStart",
  /**
   * @param {number} playerId
   */
  (playerId) => {
    console.log("HandleGameStart", playerId);

    state.isTurn = state.playerId === playerId;
    document.getElementById(`turn-${playerId}`).classList.remove("hidden");
  }
);

gameHubConnection.on(
  "HandleMove",
  /**
   * @param {number} playerId
   * @param {number} dot
   * @param {number[][]} polygons
   * @param {number[]} currentOccupiedDots 
   * @param {number} nextTurnPlayerId 
   */
  (playerId, dot, polygons, currentOccupiedDots, nextTurnPlayerId) => {
    console.log("HandleMove", playerId, dot, polygons, currentOccupiedDots, nextTurnPlayerId);

    if (playerId !== state.playerId) {
      board[dot] = playerId;
      document.getElementById(dot.toString()).classList.add("rounded-full", PLAYERS_METADATA[playerId].dotColor);
    }

    const scoreElement = document.getElementById(`score-${playerId}`);
    const score = parseInt(scoreElement.innerText) + currentOccupiedDots.length;
    scoreElement.innerText = score.toString();

    if (currentOccupiedDots.length !== 0) {
      currentOccupiedDots.forEach(x => occupiedDots.add(x));
    }

    if (polygons.length !== 0) {
      drawPolygons(polygons, canvas, PLAYERS_METADATA[playerId].strokeStyle, PLAYERS_METADATA[playerId].fillStyle);
      excludeDotsWithinPolygonsFromGame(polygons);
    }

    state.isTurn = state.playerId === nextTurnPlayerId;
    document.getElementById(`turn-${playerId}`).classList.add("hidden");
    document.getElementById(`turn-${nextTurnPlayerId}`).classList.remove("hidden");
  }
);

gameHubConnection.on(
  "HandleError",
  /**
   * @param {string} message
   */
  (message) => {
    console.log("HandleError", message);

    const logEntry = document.createElement("div");
    logEntry.classList.add("font-mono", "font-bold", "text-red-500");
    logEntry.innerText = message;
    logs.append(logEntry);
  }
);

gameHubConnection.on(
  "HandleDisconnectedPlayer",
  /**
   * @param {number} disconnectedPlayerId
   * @param {boolean} gameStarted
   */
  (disconnectedPlayerId, gameStarted) => {
    console.log("HandleDisconnectedPlayer", disconnectedPlayerId, gameStarted);

    if (gameStarted) {
      document.getElementById(`name-${disconnectedPlayerId}`).innerText += " (disconnected)";
      return;
    }

    const disconnectedPlayer = document.getElementById(`player-${disconnectedPlayerId.toString()}`);

    for (let i = disconnectedPlayerId + 1; i < players.children.length; i++) {
      document.getElementById(`player-${i}`).id = `player-${(i - 1)}`;

      const turn = document.getElementById(`turn-${i}`);
      turn.id = `turn-${i - 1}`;
      turn.classList.replace(PLAYERS_METADATA[i].textColor, PLAYERS_METADATA[i - 1].textColor);

      const playerName = document.getElementById(`name-${i}`);
      playerName.id = `name-${i - 1}`;
      playerName.classList.replace(PLAYERS_METADATA[i].textColor, PLAYERS_METADATA[i - 1].textColor);
      playerName.innerText = playerName.innerText.replace((i + 1).toString(), i.toString());

      const score = document.getElementById(`score-${i}`);
      score.id = `score-${i - 1}`;
      score.classList.replace(PLAYERS_METADATA[i].textColor, PLAYERS_METADATA[i - 1].textColor);
    }

    players.removeChild(disconnectedPlayer);

    if (state.playerId > disconnectedPlayer) state.playerId--;
  }
);

gameHubConnection.start();

startButton.onclick = () => {
  gameHubConnection.invoke("StartGame", state.playerId);
}

drawField();
drawDots();

/**
 * @param {number} playerId
 * @param {boolean} self
 */
function createPlayer(playerId, self) {
  const player = document.createElement("div");
  player.id = `player-${playerId}`;

  const turn = document.createElement("span");
  turn.id = `turn-${playerId}`;
  turn.classList.add("hidden", "font-mono", "font-bold", PLAYERS_METADATA[playerId].textColor);
  turn.innerText = "> ";

  const playerName = document.createElement("span");
  playerName.id = `name-${playerId}`;
  playerName.classList.add("pr-4", "font-mono", "font-bold", PLAYERS_METADATA[playerId].textColor);
  playerName.innerText = `Player ${playerId + 1}`;

  if (self) {
    playerName.innerText += " (you)";
  }

  const score = document.createElement("span");
  score.id = `score-${playerId}`;
  score.classList.add("font-mono", "font-bold", PLAYERS_METADATA[playerId].textColor);
  score.innerText = "0";

  player.append(turn, playerName, score);

  return player;
}

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

      board[dot] = -1;

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

  if (board[dot] !== -1 || !state.isTurn) return;

  board[dot] = state.playerId;

  dotElement.classList.add("rounded-full", PLAYERS_METADATA[state.playerId].dotColor);

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
    dot => board[dot] !== -1 && board[dot] !== state.playerId && !occupiedDots.has(dot)
  );

  console.log("unoccupied dots within extreme points", unoccupiedDotsWithinExtremePoints);

  const [polygons, currentOccupiedDots] = detectPolygons(unoccupiedDotsWithinExtremePoints, extremePoints, dot, leader);

  gameHubConnection.invoke("Move", state.playerId, dot, polygons, currentOccupiedDots);
}

/**
 * @param {number} dot
 */
function addDotToUnion(dot) {
  let dotIsInUnion = false;

  for (let direction of DIRECTIONS) {
    if (isDirectionOutOfBorder(direction, dot)) continue;

    const neighbor = dot + direction;

    if (board[neighbor] !== state.playerId) continue;

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

      if (board[unionToMergeNeighbor] !== state.playerId) continue;

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

    if (topOffset > extremePoints[3]) break;

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
 * @returns {[number[][], number[]]}
 */
function detectPolygons(innerDots, extremePoints, dot, unionLeader) {
  /**
   * @type {number[][]}
   */
  const polygons = [];

  /**
   * @type {number[]}
   */
  const currentOccupiedDots = [];

  outer:
  for (let startDot of innerDots) {
    for (let polygon of polygons) {
      const intersectionCount = raycast(startDot, polygon, extremePoints[1]);

      if (intersectionCount % 2 == 1) {
        occupiedDots.add(startDot);
        currentOccupiedDots.push(startDot);
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
      /**
       * @type {number}
       */
      const currentDot = stack.pop();

      if (
        leaders[currentDot] === unionLeader &&
        !occupiedDots.has(currentDot) &&
        unions[leaders[currentDot]][currentDot].length >= 2
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
    currentOccupiedDots.push(startDot);
    polygons.push(normalizePolygon(polygon, dot, unionLeader));
  }

  return [polygons, currentOccupiedDots];
}

/**
 * @param {number[]} polygon
 * @param {number} dot
 * @param {number} unionLeader
 */
function normalizePolygon(polygon, dot, unionLeader) {
  /**
   * @type {number[][]}
   */
  const polygonVariations = [];

  /**
   * @type {number[][]}
   */
  const stack = [[dot]];

  while (stack.length > 0) {
    /**
     * @type {number[]}
     */
    const currentPath = stack.pop();
    const currentDot = currentPath[currentPath.length - 1];

    const nextDots = unions[unionLeader][currentDot].filter(x => polygon.includes(x) && !currentPath.includes(x));

    if (
      nextDots.length === 0 &&
      // first and last dots in the path are actually neighbors
      unions[unionLeader][currentPath[0]].includes(currentDot)
    ) {
      polygonVariations.push(currentPath);
      continue;
    }

    nextDots.forEach(x => stack.push(currentPath.concat(x)));
  }

  console.log("valid polygon variations", polygonVariations);

  /**
   * @type {number[]}
   */
  let normalizedPolygon = [];

  for (let polygonVariation of polygonVariations) {
    if (polygonVariation.length > normalizedPolygon.length) {
      normalizedPolygon = polygonVariation;
    }
  }

  console.log("normalized polygon", normalizedPolygon);

  return normalizedPolygon;
}

/**
 * @param {number[][]} polygons
 * @param {CanvasRenderingContext2D} canvas
 * @param {string} strokeStyle
 * @param {string} fillStyle
 */
function drawPolygons(polygons, canvas, strokeStyle, fillStyle) {
  canvas.strokeStyle = strokeStyle;
  canvas.lineWidth = 2;
  canvas.fillStyle = fillStyle;

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
 * @param {number[][]} polygons
 */
function excludeDotsWithinPolygonsFromGame(polygons) {
  for (let polygon of polygons) {
    const extremePoints = getExtremePoints(polygon);
    const dotsToExclude = getDotsWithinExtremePoints(
      extremePoints,
      dot => !polygon.includes(dot) && raycast(dot, polygon, extremePoints[1]) % 2 === 1
    );

    for (let dotToExclude of dotsToExclude) {
      const dotElement = document.getElementById(dotToExclude.toString());
      dotElement.classList.replace("cursor-pointer", "cursor-not-allowed");
      dotElement.onclick = undefined;
    }
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