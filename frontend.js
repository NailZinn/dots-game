const TOTAL_ROWS = 32;
const TOTAL_COLUMNS = 39;
const CELL_SIZE = 20;

const PLAYERS_METADATA = [
  { strokeStyle: "blue", fillStyle: "rgb(0 0 255 / 40%)", dotColor: "bg-blue-500", textColor: "text-blue-500" },
  { strokeStyle: "red", fillStyle: "rgb(255 0 0 / 40%)", dotColor: "bg-red-500", textColor: "text-red-500" },
  { strokeStyle: "green", fillStyle: "rgb(0 255 0 / 40%)", dotColor: "bg-green-500", textColor: "text-green-500" },
  { strokeStyle: "yellow", fillStyle: "rgb(255 255 0 / 40%)", dotColor: "bg-yellow-500", textColor: "text-yellow-500" }
];

const state = {
  connectionId: undefined,
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
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");

const logs = document.getElementById("logs");

/**
 * @type {number[]}
 */
const board = [];

const ws = new WebSocket("/ws");

ws.onopen = () => ws.send(JSON.stringify({ type: "connect" }));

/**
 * @param {MessageEvent} event
 */
ws.onmessage = (event) => {
  /**
   * @type {(
   *  | { type: "error", text: string }
   *  | { type: "ping" }
   *  | { type: "HandleImport", board: number[], excludedDots: number[], playersPolygons: { polygons: number[][], occupiedDots: number[] }[], currentTurnPlayerId: number }
   *  | { type: "ReceivePlayerId", connectionId: string, playerId: number }
   *  | { type: "ReceiveNewPlayerId", newPlayerId: number }
   *  | { type: "HandleGameStart", playerId: number }
   *  | { type: "HandleMove", playerId: number, dot: number, polygons: number[][], currentOccupiedDots: number[], dotsExcludedFromGame: number[], trapPolygon: number[], trapPolygonOwnerId: number, nextTurnPlayerId: number }
   *  | { type: "HandleDisconnectedPlayer", disconnectedPlayerId: number, gameStarted: boolean, currentTurnPlayerId: number }
   * )}
   */
  const message = JSON.parse(event.data);

  console.log(message);

  switch (message.type) {
    case "HandleImport": {
      const { board: importedBoard, excludedDots, playersPolygons, currentTurnPlayerId } = message;

      importedBoard.forEach((x, i) => board[i] = x);

      for (let i = 0; i < board.length; i++) {
        if (board[i] === -1) continue;
        document.getElementById(i.toString()).classList.add("rounded-full", PLAYERS_METADATA[board[i]].dotColor);
      }

      for (let i = 0; i < playersPolygons.length; i++) {
        const scoreElement = document.getElementById(`score-${i}`);
        const score = parseInt(scoreElement.innerText) + playersPolygons[i].occupiedDots.length;
        scoreElement.innerText = score.toString();

        if (playersPolygons[i].polygons.length !== 0) {
          drawPolygons(playersPolygons[i].polygons, canvas, PLAYERS_METADATA[i].strokeStyle, PLAYERS_METADATA[i].fillStyle);
        }
      }

      excludeDotsFromGame(excludedDots);

      state.isTurn = state.playerId === currentTurnPlayerId;
      document.getElementById(`turn-${currentTurnPlayerId}`).classList.remove("hidden");

      break;
    }
    case "ReceivePlayerId": {
      const playerId = message.playerId;
      const connectionId = message.connectionId;

      for (let i = 0; i <= playerId; i++) {
        const player = createPlayer(i, i === playerId);
        players.append(player);
      }

      state.connectionId = connectionId;
      state.playerId = playerId;

      break;
    }
    case "ReceiveNewPlayerId": {
      const newPlayerId = message.newPlayerId;

      const player = createPlayer(newPlayerId, false);
      players.append(player);

      break;
    }
    case "HandleGameStart": {
      const playerId = message.playerId;

      state.isTurn = state.playerId === playerId;
      document.getElementById(`turn-${playerId}`).classList.remove("hidden");

      exportButton.classList.replace("text-red-500/50", "text-red-500");
      exportButton.classList.remove("cursor-not-allowed");

      importButton.classList.replace("text-red-500", "text-red-500/50");
      importButton.classList.add("cursor-not-allowed");

      break;
    }
    case "HandleMove": {
      const { playerId, dot, polygons, currentOccupiedDots, dotsExcludedFromGame, trapPolygon, trapPolygonOwnerId, nextTurnPlayerId } = message;

      board[dot] = playerId;
      document.getElementById(dot.toString()).classList.add("rounded-full", PLAYERS_METADATA[playerId].dotColor);
      
      if (polygons.length !== 0) {
        const scoreElement = document.getElementById(`score-${playerId}`);
        const score = parseInt(scoreElement.innerText) + currentOccupiedDots.length;
        scoreElement.innerText = score.toString();

        drawPolygons(polygons, canvas, PLAYERS_METADATA[playerId].strokeStyle, PLAYERS_METADATA[playerId].fillStyle);
      } else if (trapPolygon.length !== 0) {
        const scoreElement = document.getElementById(`score-${trapPolygonOwnerId}`);
        const score = parseInt(scoreElement.innerText) + 1;
        scoreElement.innerText = score.toString();

        drawPolygons([trapPolygon], canvas, PLAYERS_METADATA[trapPolygonOwnerId].strokeStyle, PLAYERS_METADATA[trapPolygonOwnerId].fillStyle);
      }

      excludeDotsFromGame(dotsExcludedFromGame);

      state.isTurn = state.playerId === nextTurnPlayerId;
      document.getElementById(`turn-${playerId}`).classList.add("hidden");
      document.getElementById(`turn-${nextTurnPlayerId}`).classList.remove("hidden");

      break;
    }
    case "error": {
      const errorMessage = message.text;

      console.log("error", errorMessage);

      const logEntry = document.createElement("div");
      logEntry.classList.add("font-mono", "font-bold", "text-red-500");
      logEntry.innerText = errorMessage;
      logs.append(logEntry);

      break;
    }
    case "ping": {
      ws.send(JSON.stringify({ type: "pong", connectionId: state.connectionId }));
      break;
    }
    case "HandleDisconnectedPlayer": {
      const { disconnectedPlayerId, gameStarted, currentTurnPlayerId } = message;

      if (gameStarted) {
        document.getElementById(`name-${disconnectedPlayerId}`).innerText += " (disconnected)";

        const disconnectedPlayerTurn = document.getElementById(`turn-${disconnectedPlayerId}`);
        if (!disconnectedPlayerTurn.classList.contains("hidden")) {
          disconnectedPlayerTurn.classList.add("hidden");
        }
        const currentTurnPlayerTurn = document.getElementById(`turn-${currentTurnPlayerId}`);
        if (currentTurnPlayerTurn.classList.contains("hidden")) {
          currentTurnPlayerTurn.classList.remove("hidden");
        }

        state.isTurn = state.playerId === currentTurnPlayerId;

        break;
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

      break;
    }
  }
}

startButton.onclick = () => {
  ws.send(JSON.stringify({ type: "start", playerId: state.playerId }));
}

exportButton.onclick = async () => {
  const response = await fetch("/export");
  const blob = await response.blob();
  const fileName = response.headers.get("X-File-Name");

  console.log(blob);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

if (window.showOpenFilePicker) {
  importButton.onclick = async () => {
    /** @type {[FileSystemFileHandle]} */
    const [fileHandle] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();

    console.log(file);

    await fetch("/import", {
      method: "POST",
      body: file
    });
  }
} else {
  importButton.onclick = () => {
    const input = document.createElement("input");
    input.type = "file";

    input.onchange = async (event) => {
      const [file] = event.target.files;

      console.log(file);

      await fetch("/import", {
        method: "POST",
        body: file
      });
    }

    input.click();
  }
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

  ws.send(JSON.stringify({ type: "move", dot: dot, connectionId: state.connectionId, playerId: state.playerId }));

  return;
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

  for (const polygon of polygons) {
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
 * @param {number[]} dotsToExclude
 */
function excludeDotsFromGame(dotsToExclude) {
  for (const dotToExclude of dotsToExclude) {
    const dotElement = document.getElementById(dotToExclude.toString());
    dotElement.classList.replace("cursor-pointer", "cursor-not-allowed");
    dotElement.onclick = undefined;
  }
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