import { serveFile } from "jsr:@std/http@1.0.25/file-server";
import * as uuid from "jsr:@std/uuid@1.1.0";

const MAX_ROOM_SIZE = 4;

const connectedPlayers = new Array<boolean>(MAX_ROOM_SIZE).fill(false);

let gameStarted = false;
let roomSize = 0;

const TOTAL_ROWS = 32;
const TOTAL_COLUMNS = 39;

const LEFT          = -1;
const RIGHT         = 1;
const TOP           = -(TOTAL_COLUMNS - 1);
const BOTTOM        = (TOTAL_COLUMNS - 1);
const TOP_LEFT      = LEFT + TOP;
const TOP_RIGHT     = RIGHT + TOP;
const BOTTOM_LEFT   = LEFT + BOTTOM;
const BOTTOM_RIGHT  = RIGHT + BOTTOM;

const DIRECTIONS = [LEFT, RIGHT, TOP, BOTTOM, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT] as const;

const LEFT_DIRECTIONS = [TOP_LEFT, LEFT, BOTTOM_LEFT] as const;

const RIGHT_DIRECTIONS = [TOP_RIGHT, RIGHT, BOTTOM_RIGHT] as const;

const AXIS_DIRECTIONS = [LEFT, RIGHT, TOP, BOTTOM] as const;

const DIAGONAL_DIRECTIONS = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT] as const;

const DIRECTION_TO_UNION_MERGE_DIRECTIONS = new Map<typeof DIRECTIONS[number], number[]>([
  [LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT]],
  [TOP, [BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM, [TOP_LEFT, TOP, TOP_RIGHT]],
  [TOP_LEFT, [TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT]],
  [TOP_RIGHT, [TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT]],
  [BOTTOM_LEFT, [TOP_LEFT, TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT]],
  [BOTTOM_RIGHT, [TOP_RIGHT, TOP, TOP_LEFT, LEFT, BOTTOM_LEFT]]
]);

const DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS = new Map<typeof DIAGONAL_DIRECTIONS[number], [number, number]>([
  [TOP_LEFT, [TOP, LEFT]],
  [TOP_RIGHT, [TOP, RIGHT]],
  [BOTTOM_LEFT, [BOTTOM, LEFT]],
  [BOTTOM_RIGHT, [BOTTOM, RIGHT]]
]);

const board: number[] = [];

const unions: number[][][] = [];

const leaders: number[] = [];

const occupiedDots = new Set<number>();

const players = new Map<string, Player>();

Deno.serve({ hostname: "0.0.0.0", port: 5000 }, async (req: Request) => {
  const path = new URL(req.url).pathname;

  try {
    const filePath = path.slice(1);
    const fileInfo = await Deno.lstat(filePath);
    
    if (fileInfo.isFile) {
      return serveFile(req, filePath);
    }
  }
  // deno-lint-ignore no-empty
  catch (_) {}
  
  if (path !== "/ws") {
    return new Response("Not Found", { status: 404 });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Switch to WebSocket", { status: 426 });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);

  ws.onmessage = (event) => {
    const message: Message = JSON.parse(event.data);

    console.log("MESSAGE:", message);

    switch (message.type) {
      case "connect": {
        connect(ws);
        break;
      }
      case "start": {
        start(ws, message);
        break;
      }
      case "move": {
        move(message);
        break;
      }
      case "disconnect": {
        disconnect(message);
        break;
      }
    }
  };
  
  return response;  
});

// HANDLERS

function connect(ws: WebSocket) {
  if (roomSize === MAX_ROOM_SIZE) {
    ws.send(JSON.stringify({ type: "error", text: `Room reached maximum number of players - ${MAX_ROOM_SIZE}!`}));
    ws.close();
    return;
  }

  if (gameStarted) {
    ws.send(JSON.stringify({ type: "error", text: "Game has already started!" }));
    ws.close();
    return;
  }

  const currentConnectionId = uuid.v7.generate();

  players.set(currentConnectionId, { id: roomSize, ws, isTurn: false });
  connectedPlayers[roomSize] = true;

  for (const [connectionId, player] of players) {
    if (connectionId === currentConnectionId) {
      player.ws.send(JSON.stringify({ type: "ReceivePlayerId", connectionId, playerId: roomSize }));
    }
    else {
      player.ws.send(JSON.stringify({ type: "ReceiveNewPlayerId", newPlayerId: roomSize }));
    }
  }

  roomSize++;
};

function start(ws: WebSocket, message: StartMessage) {
  if (gameStarted) return;

  if (roomSize < 2) {
    ws.send(JSON.stringify({ type: "error", text: "At least 2 players required to start the game!" }));
    return;
  }

  gameStarted = true;

  for (let r = 2; r <= TOTAL_ROWS; r++) {
    for (let c = 2; c <= TOTAL_COLUMNS; c++) {
      board.push(-1);
    }
  }

  for (const [_, player] of players) {
    if (player.id === message.playerId) {
      player.isTurn = true;
    }
    player.ws.send(JSON.stringify({ type: "HandleGameStart", playerId: message.playerId }));
  }
};

function move(message: MoveMessage) {
  if (
    board[message.dot] !== -1 ||
    !players.has(message.connectionId) ||
    !players.get(message.connectionId)!.isTurn
  ) return;

  board[message.dot] = message.playerId;

  addDotToUnion(message.dot, message.playerId);

  const leader = leaders[message.dot];

  const extremePoints = getExtremePoints(
    unions[leader]
      .map((x, i) => [x, i] as const)
      .filter(x => x)
      .map(([_, i]) => i)
  );

  const unoccupiedDotsWithinExtremePoints = getDotsWithinExtremePoints(
    extremePoints,
    dot => board[dot] !== -1 && board[dot] !== message.playerId && !occupiedDots.has(dot)
  );

  const [polygons, currentOccupiedDots] = detectPolygons(unoccupiedDotsWithinExtremePoints, extremePoints, message.dot, leader);

  let dotsExcludedFromGame: number[] = [];
  
  let trapPolygon: number[] = [];
  let trapPolygonOwnerId = -1;

  if (polygons.length === 0) {
    for (const [_, { id }] of players) {
      if (id === message.playerId) continue;

      trapPolygon = detectTrapPolygon(message.dot, id);
      if (trapPolygon.length !== 0) {
        trapPolygonOwnerId = id;
        occupiedDots.add(message.dot);
        dotsExcludedFromGame = getDotsExcludedFromGame([trapPolygon]);
        break;
      }
    }
  }
  else {
    currentOccupiedDots.forEach(x => occupiedDots.add(x));
    dotsExcludedFromGame = getDotsExcludedFromGame(polygons);
  }

  let nextTurnPlayerId = message.playerId;

  do {
    nextTurnPlayerId = (nextTurnPlayerId + 1) % roomSize;
  } while (!connectedPlayers[nextTurnPlayerId]);

  const response = {
    type: "HandleMove",
    playerId: message.playerId,
    dot: message.dot,
    polygons: polygons,
    currentOccupiedDots: currentOccupiedDots,
    dotsExcludedFromGame: dotsExcludedFromGame,
    trapPolygon: trapPolygon,
    trapPolygonOwnerId: trapPolygonOwnerId,
    nextTurnPlayerId: nextTurnPlayerId
  };

  const payload = JSON.stringify(response);

  for (const [_, player] of players) {
    if (player.id === message.playerId) {
      player.isTurn = false;
    }
    else if (player.id === nextTurnPlayerId) {
      player.isTurn = true;
    }
    player.ws.send(payload);
  }
};

function disconnect(message: DisconnectMessage) {
  const removed = players.delete(message.connectionId);

  if (!removed) return;

  for (const [_, player] of players) {
    if (!gameStarted && player.id > message.playerId) player.id--;

    if (player.id !== message.playerId) {
      player.ws.send(JSON.stringify({ type: "HandleDisconnectedPlayer", disconnectedPlayerId: message.playerId, gameStarted }));
    }
  }

  roomSize--;

  if (!gameStarted) {
    connectedPlayers[roomSize] = false;
  }
  else {
    connectedPlayers[message.playerId] = false;
  }
};

// HANDLERS

// FUNCTIONS

function addDotToUnion(dot: number, playerId: number) {
  let dotIsInUnion = false;

  for (const direction of DIRECTIONS) {
    if (isDirectionOutOfBorder(direction, dot)) continue;

    const neighbor = dot + direction;

    if (board[neighbor] !== playerId) continue;

    const leader = leaders[neighbor];

    unions[leader][neighbor].push(dot);
    unions[leader][dot] ??= [];
    unions[leader][dot].push(neighbor);

    if (dotIsInUnion) continue;

    leaders[dot] = leader;

    dotIsInUnion = true;

    for (const unionMergeDirection of DIRECTION_TO_UNION_MERGE_DIRECTIONS.get(direction) ?? []) {
      if (isDirectionOutOfBorder(unionMergeDirection, dot)) continue;

      const unionToMergeNeighbor = dot + unionMergeDirection;

      if (board[unionToMergeNeighbor] !== playerId) continue;

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

function getExtremePoints(figure: number[]) {
  const extremePoints: ExtremePoints = [-1, -1, -1, -1];

  for (const dot of figure) {
    const [leftOffset, topOffset] = getOffsets(dot);

    if (extremePoints[0] === -1 || leftOffset < extremePoints[0]) extremePoints[0] = leftOffset;
    if (extremePoints[1] === -1 || leftOffset > extremePoints[1]) extremePoints[1] = leftOffset;
    if (extremePoints[2] === -1 || topOffset < extremePoints[2]) extremePoints[2] = topOffset;
    if (extremePoints[3] === -1 || topOffset > extremePoints[3]) extremePoints[3] = topOffset;
  }

  return extremePoints;
}

function getDotsWithinExtremePoints(
  extremePoints: ExtremePoints,
  predicate: (dot: number) => boolean
) {
  const dotsWithinExtremePoints: number[] = [];

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

  return dotsWithinExtremePoints;
}

function detectPolygons(
  innerDots: number[],
  extremePoints: ExtremePoints,
  dot: number,
  unionLeader: number
) {
  const polygons: number[][] = [];

  const currentOccupiedDots: number[] = [];

  outer:
  for (const startDot of innerDots) {
    for (const polygon of polygons) {
      const intersectionCount = raycast(startDot, polygon, extremePoints[1]);

      if (intersectionCount % 2 === 1) {
        currentOccupiedDots.push(startDot);
        continue outer;
      }
    }

    const polygon = detectPolygon(startDot, extremePoints, dot, unionLeader);

    if (polygon.length === 0) continue;

    currentOccupiedDots.push(startDot);
    polygons.push(polygon);
  }

  return [polygons, currentOccupiedDots] as const;
}

function detectPolygon(
  startDot: number,
  extremePoints: ExtremePoints,
  dot: number,
  unionLeader: number
) {
  const polygon: number[] = [];

  const stack: number[] = [startDot];

  const visited = new Set<number>([startDot]);

  while (stack.length > 0) {
    const currentDot = stack.pop()!;

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
    ) return [];

    for (const direction of AXIS_DIRECTIONS) {
      if (!visited.has(currentDot + direction)) {
        stack.push(currentDot + direction);
        visited.add(currentDot + direction);
      }
    }

    for (const direction of DIAGONAL_DIRECTIONS) {
      if (
        DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS.get(direction)?.some(x => leaders[currentDot + x] !== unionLeader) &&
        !visited.has(currentDot + direction)
      ) {
        stack.push(currentDot + direction);
        visited.add(currentDot + direction);
      }
    }
  }

  return normalizePolygon(polygon, dot, unionLeader);
}

function detectTrapPolygon(startDot: number, playerId: number) {
  const polygon: number[] = [];

  const stack: number[] = [startDot];

  const visited = new Set<number>([startDot]);

  while (stack.length > 0) {
    const currentDot = stack.pop()!;

    if (
      board[currentDot] === playerId &&
      !occupiedDots.has(currentDot)
    ) {
      polygon.push(currentDot);
      continue;
    }

    const [leftOffset, topOffset] = getOffsets(currentDot);

    if (
      leftOffset === 0 || leftOffset === TOTAL_COLUMNS - 2 ||
      topOffset === 0 || topOffset === TOTAL_ROWS - 2 ||
      (
        currentDot !== startDot &&
        !occupiedDots.has(currentDot) &&
        board[currentDot] !== -1 &&
        board[currentDot] !== playerId
      )
    ) return [];

    for (const direction of AXIS_DIRECTIONS) {
      if (!visited.has(currentDot + direction)) {
        stack.push(currentDot + direction);
        visited.add(currentDot + direction);
      }
    }

    for (const direction of DIAGONAL_DIRECTIONS) {
      const [vertical, horizontal] = DIAGONAL_DIRECTION_TO_AXIS_DIRECTIONS.get(direction)!;
      if (
        (
          board[currentDot + vertical] === -1 ||
          board[currentDot + horizontal] === -1
        ) &&
        !visited.has(currentDot + direction)
      ) {
        stack.push(currentDot + direction);
        visited.add(currentDot + direction);
      }
    }
  }

  if (polygon.length === 0) return [];

  // assume that top-left dot of a raw polygon will definitely be part of the normalized polygon
  const polygonStartDot = Math.min(...polygon);

  return normalizePolygon(polygon, polygonStartDot, leaders[polygonStartDot]);
}

function normalizePolygon(
  polygon: number[],
  polygonStartDot: number,
  unionLeader: number
) {
  const polygonVariations: number[][] = [];

  const stack: number[][] = [[polygonStartDot]];

  while (stack.length > 0) {
    const currentPath = stack.pop() as number[];
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

  let normalizedPolygon: number[] = [];

  for (const polygonVariation of polygonVariations) {
    if (polygonVariation.length > normalizedPolygon.length) {
      normalizedPolygon = polygonVariation;
    }
  }

  console.log("normalized polygon", normalizedPolygon);

  return normalizedPolygon;
}

function getDotsExcludedFromGame(polygons: number[][]) {
  const dotsExcludedFromGame: number[] = [];
  for (const polygon of polygons) {
    const extremePoints = getExtremePoints(polygon);
    dotsExcludedFromGame.push(...getDotsWithinExtremePoints(
      extremePoints,
      dot => !polygon.includes(dot) && raycast(dot, polygon, extremePoints[1]) % 2 === 1 && board[dot] === -1
    ));
  }
  return dotsExcludedFromGame;
}

function raycast(dot: number, figure: number[], rightBorder: number) {
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

function isDirectionOutOfBorder(direction: number, dot: number) {
  const dotIsOnLeftBorder = getOffsets(dot)[0] === 0;
  const dotIsOnRightBorder = getOffsets(dot + 1)[0] === 0;

  return (
    LEFT_DIRECTIONS.includes(direction) && dotIsOnLeftBorder ||
    RIGHT_DIRECTIONS.includes(direction) && dotIsOnRightBorder
  );
}

function getOffsets(dot: number) {
  return [
    // left
    dot % (TOTAL_COLUMNS - 1),
    // top
    Math.trunc(dot / (TOTAL_COLUMNS - 1))
  ] as const;
}

// FUNCTIONS

// TYPES

type Player = {
  id: number,
  ws: WebSocket,
  isTurn: boolean
};

type ExtremePoints = [number, number, number, number];

type Message = 
  | ConnectMessage
  | StartMessage
  | MoveMessage
  | DisconnectMessage;

type ConnectMessage = MessageType<"connect">;

type StartMessage = ConnectionId & MessageType<"start"> & {
  playerId: number
};

type MoveMessage = ConnectionId & MessageType<"move"> & {
  playerId: number,
  dot: number
};

type DisconnectMessage = ConnectionId & MessageType<"disconnect"> & {
  playerId: number
};

type ConnectionId = { connectionId: string };

type MessageTypes = "connect" | "start" | "move" | "disconnect";

type MessageType<T extends MessageTypes> = { type: T };

// TYPES