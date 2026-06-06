import { serveFile } from "jsr:@std/http@1.0.25/file-server";
import * as uuid from "jsr:@std/uuid@1.1.0";

const MAX_ROOM_SIZE = 4;
const MESSAGE_HANDLERS: MessageHandlers = {
  connect(_: ConnectMessage) {},
  start(_: StartMessage) {},
  move(_: MoveMessage) {},
  sendTrapPolygon(_: SendTrapPolygonMessage) {},
  disconnect(_: DisconnectMessage) {}
};

const connectedPlayers = new Array(MAX_ROOM_SIZE).fill(false);

let gameStarted = false;
let roomSize = 0;

let moveCompletions: boolean[] = [];
let trapPolygon: number[] = [];
let trappedDot = -1;
let trapPolygonOwnerId = -1;

const connectionIdToPlayers = new Map<string, { id: number, ws: WebSocket }>();

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

    console.log("MESSAGE:", message)

    switch (message.type) {
      case "connect": {
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

        connectionIdToPlayers.set(currentConnectionId, { id: roomSize, ws });
        connectedPlayers[roomSize] = true;

        for (const [connectionId, player] of connectionIdToPlayers) {
          if (connectionId === currentConnectionId) {
            player.ws.send(JSON.stringify({ type: "ReceivePlayerId", connectionId, playerId: roomSize }));
          }
          else {
            player.ws.send(JSON.stringify({ type: "ReceiveNewPlayerId", newPlayerId: roomSize }));
          }
        }

        roomSize++;

        break;
      }
      case "start": {
        if (gameStarted) return;

        if (roomSize < 2) {
          ws.send(JSON.stringify({ type: "error", text: "At least 2 players required to start the game!" }));
          return;
        }

        gameStarted = true;
        moveCompletions = new Array(roomSize).fill(false);

        for (const [_, player] of connectionIdToPlayers) {
          player.ws.send(JSON.stringify({ type: "HandleGameStart", playerId: message.playerId }));
        }
        
        break;
      }
      case "move": {
        for (const [_, player] of connectionIdToPlayers) {
          player.ws.send(JSON.stringify({ type: "HandleMove", playerId: message.playerId, dot: message.dot, polygons: message.polygons, currentOccupiedDots: message.currentOccupiedDots }));
        }

        break;
      }
      case "sendTrapPolygon": {
        moveCompletions[message.trapPolygonOwnerId] = true;

        if (message.trapPolygon.length !== 0) {
          trapPolygon = message.trapPolygon;
          trappedDot = message.trappedDot;
          trapPolygonOwnerId = message.trapPolygonOwnerId;
        }

        if (!moveCompletions.every(x => x)) return;

        let nextTurnPlayerId = message.currentTurnPlayerId;

        do {
          nextTurnPlayerId = (nextTurnPlayerId + 1) % roomSize;
        }
        while (!connectedPlayers[nextTurnPlayerId]);

        for (const [_, player] of connectionIdToPlayers) {
          player.ws.send(JSON.stringify({ type: "HandleTrapPolygon", currentTurnPlayerId: message.currentTurnPlayerId, trapPolygon, trappedDot, trapPolygonOwnerId, nextTurnPlayerId }));
        }

        for (let i = 0; i < moveCompletions.length; i++) {
          moveCompletions[i] = false;
        }

        break;
      }
      case "disconnect": {
        const removed = connectionIdToPlayers.delete(message.connectionId);

        if (!removed) return;

        for (const [_, player] of connectionIdToPlayers) {
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

        break;
      }
    }
  };
  
  return response;  
});

type Message = 
  | ConnectMessage
  | StartMessage
  | MoveMessage
  | SendTrapPolygonMessage
  | DisconnectMessage;

type MessageHandlers = {
  connect(_: ConnectMessage): void,
  start(_: StartMessage): void,
  move(_: MoveMessage): void
  sendTrapPolygon(_: SendTrapPolygonMessage): void
  disconnect(_: DisconnectMessage): void
}

type MessageType<T extends keyof MessageHandlers> = keyof Pick<MessageHandlers, T>

type ConnectMessage = {
  type: MessageType<"connect">
}

type StartMessage = ConnectionId & {
  type: MessageType<"start">
  playerId: number
};

type MoveMessage = ConnectionId & {
  type: MessageType<"move">
  playerId: number,
  dot: number,
  polygons: number[][],
  currentOccupiedDots: number[]
};

type SendTrapPolygonMessage = ConnectionId & {
  type: MessageType<"sendTrapPolygon">,
  currentTurnPlayerId: number,
  trapPolygon: number[],
  trappedDot: number,
  trapPolygonOwnerId: number
};

type DisconnectMessage = ConnectionId & {
  type: MessageType<"disconnect">,
  playerId: number
};

type ConnectionId = { connectionId: string };