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
 * @type {({ rtcConnection: RTCPeerConnection, audioTrack: RTCRtpSender })[]}
 */
const peers = [];

/**
 * @type {HTMLBodyElement}
 */
const body = document.getElementById("body");

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
renderVoiceChatControls();

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
  
  if (!self) {
    const audio = document.createElement("audio");
    audio.id = `audio-${playerId}`;
    player.append(audio);
  }

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

function renderVoiceChatControls() {
  const microphoneOnSvgString = `<svg width="32px" height="32px" viewBox="-5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" fill="#000000" stroke="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>microphone</title> <desc>Created with Sketch Beta.</desc> <defs> </defs> <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage"> <g id="Icon-Set-Filled" sketch:type="MSLayerGroup" transform="translate(-107.000000, -309.000000)" fill="#fb2c36"> <path d="M118,333 C121.866,333 125,329.866 125,326 L125,316 C125,312.134 121.866,309 118,309 C114.134,309 111,312.134 111,316 L111,326 C111,329.866 114.134,333 118,333 L118,333 Z M129,328 L127,328 C126.089,332.007 122.282,335 118,335 C113.718,335 109.911,332.007 109,328 L107,328 C107.883,332.799 112.063,336.51 117,336.955 L117,339 L116,339 C115.448,339 115,339.448 115,340 C115,340.553 115.448,341 116,341 L120,341 C120.552,341 121,340.553 121,340 C121,339.448 120.552,339 120,339 L119,339 L119,336.955 C123.937,336.51 128.117,332.799 129,328 L129,328 Z" id="microphone" sketch:type="MSShapeGroup"> </path> </g> </g> </g></svg>`;
  const microphoneOffSvgString = `<svg width="32px" height="32px" viewBox="-3.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>microphone-off</title> <desc>Created with Sketch Beta.</desc> <defs> </defs> <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage"> <g id="Icon-Set-Filled" sketch:type="MSLayerGroup" transform="translate(-156.000000, -309.000000)" fill="rgb(239 68 68 / 0.5)"> <path d="M169,335 C167.061,335 165.236,334.362 163.716,333.318 L162.31,334.742 C163.944,335.953 165.892,336.765 168,336.955 L168,339 L167,339 C166.448,339 166,339.448 166,340 C166,340.553 166.448,341 167,341 L171,341 C171.552,341 172,340.553 172,340 C172,339.448 171.552,339 171,339 L170,339 L170,336.955 C174.938,336.51 179.117,332.799 180,328 L178,328 C177.089,332.007 173.282,335 169,335 L169,335 Z M176,326 L176,320.739 L164.735,331.515 C165.918,332.432 167.386,333 169,333 C172.866,333 176,329.866 176,326 L176,326 Z M160.047,328.145 L160,328 L158,328 C158.109,328.596 158.271,329.175 158.478,329.733 L160.047,328.145 L160.047,328.145 Z M179.577,312.013 L155.99,334.597 L157.418,336.005 L181.014,313.433 L179.577,312.013 L179.577,312.013 Z M169,309 C165.134,309 162,312.134 162,316 L161.997,326.309 L175.489,313.401 C174.456,310.825 171.946,309 169,309 L169,309 Z" id="microphone-off" sketch:type="MSShapeGroup"> </path> </g> </g> </g></svg>`;
  const volumeOnSvgString = `<svg width="32px" height="32px" viewBox="0 -1.5 31 31" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>volume-full</title> <desc>Created with Sketch Beta.</desc> <defs> </defs> <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage"> <g id="Icon-Set-Filled" sketch:type="MSLayerGroup" transform="translate(-258.000000, -571.000000)" fill="#fb2c36"> <path d="M277,571.015 L277,573.068 C282.872,574.199 287,578.988 287,585 C287,590.978 283,595.609 277,596.932 L277,598.986 C283.776,597.994 289,592.143 289,585 C289,577.857 283.776,572.006 277,571.015 L277,571.015 Z M272,573 L265,577.667 L265,592.333 L272,597 C273.104,597 274,596.104 274,595 L274,575 C274,573.896 273.104,573 272,573 L272,573 Z M283,585 C283,581.477 280.388,578.59 277,578.101 L277,580.101 C279.282,580.564 281,582.581 281,585 C281,587.419 279.282,589.436 277,589.899 L277,591.899 C280.388,591.41 283,588.523 283,585 L283,585 Z M258,581 L258,589 C258,590.104 258.896,591 260,591 L263,591 L263,579 L260,579 C258.896,579 258,579.896 258,581 L258,581 Z" id="volume-full" sketch:type="MSShapeGroup"> </path> </g> </g> </g></svg>`;
  const volumeOffSvgString = `<svg width="32px" height="32px" viewBox="0 -3 30 30" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>volume-muted</title> <desc>Created with Sketch Beta.</desc> <defs> </defs> <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage"> <g id="Icon-Set-Filled" sketch:type="MSLayerGroup" transform="translate(-311.000000, -573.000000)" fill="rgb(239 68 68 / 0.5)"> <path d="M336.444,585 L340.617,580.827 C341.067,580.377 341.109,579.688 340.711,579.289 C340.312,578.891 339.623,578.933 339.173,579.383 L335,583.556 L330.827,579.383 C330.377,578.933 329.688,578.891 329.289,579.289 C328.891,579.688 328.933,580.377 329.383,580.827 L333.556,585 L329.383,589.173 C328.933,589.623 328.891,590.312 329.289,590.711 C329.688,591.109 330.377,591.067 330.827,590.617 L335,586.444 L339.173,590.617 C339.623,591.067 340.312,591.109 340.711,590.711 C341.109,590.312 341.067,589.623 340.617,589.173 L336.444,585 L336.444,585 Z M325,573 L318,577.667 L318,592.333 L325,597 C326.104,597 327,596.104 327,595 L327,575 C327,573.896 326.104,573 325,573 L325,573 Z M311,581 L311,589 C311,590.104 311.896,591 313,591 L316,591 L316,579 L313,579 C311.896,579 311,579.896 311,581 L311,581 Z" id="volume-muted" sketch:type="MSShapeGroup"> </path> </g> </g> </g></svg>`;

  const microphoneOn = createSvgFromString(microphoneOnSvgString);
  const microphoneOff = createSvgFromString(microphoneOffSvgString);
  const volumeOn = createSvgFromString(volumeOnSvgString);
  const volumeOff = createSvgFromString(volumeOffSvgString);

  microphoneOn.classList.add("hidden");
  volumeOn.classList.add("hidden");

  microphoneOn.onclick = () => {
    microphoneOn.classList.add("hidden");
    microphoneOff.classList.remove("hidden");
  };

  microphoneOff.onclick = () => {
    microphoneOff.classList.add("hidden");
    microphoneOn.classList.remove("hidden");
  };

  volumeOn.onclick = () => {
    volumeOn.classList.add("hidden");
    volumeOff.classList.remove("hidden");
  };

  volumeOff.onclick = () => {
    volumeOff.classList.add("hidden");
    volumeOn.classList.remove("hidden");
  };

  const container = document.createElement("div");
  container.classList.add("absolute", "bottom-2", "right-2", "flex", "gap-2");

  container.append(microphoneOn, microphoneOff, volumeOn, volumeOff);

  body.append(container);
}

/**
 * @param {string} str
 */
function createSvgFromString(str) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(str, "image/svg+xml");
  doc.documentElement.classList.add("cursor-pointer");
  return doc.documentElement;
}

async function enabledMicrophone() {
  try {
    const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = microphoneStream.getAudioTracks()[0];

    peers.forEach(peer => {
      peer.audioTrack = peer.rtcConnection.addTrack(audioTrack, microphoneStream);
    });
  } catch (error) {
    console.error(error);
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