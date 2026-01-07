#:sdk Microsoft.NET.Sdk.Web
#:property PublishAOT=false

using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder();

builder.Services.AddSignalR();

var app = builder.Build();

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Directory.GetCurrentDirectory())
});

app.MapGet("/", () => "Hello world");

app.MapHub<GameHub>("/gamehub");

app.Run("http://0.0.0.0:5000");

public class GameHub : Hub<IGameHubClient>
{
    private const int MaxRoomSize = 4;

    private static readonly ConcurrentDictionary<string, int> ConnectionIdToPlayerId = [];
    private static readonly bool[] ConnectedPlayers = [false, false, false, false];

    private static bool gameStarted = false;
    private static int roomSize = 0;

    private static bool[] moveCompletions = [];
    private static int[] trapPolygon = [];
    private static int trappedDot = -1;
    private static int trapPolygonOwnerId = -1;

    public async Task StartGame(int playerId)
    {
        if (gameStarted) return;

        if (roomSize < 2)
        {
            await Clients.Caller.HandleError("At least 2 players required to start the game!");
            return;
        }

        gameStarted = true;
        moveCompletions = Enumerable
            .Range(0, roomSize)
            .Select(_ => false)
            .ToArray();

        await Clients.All.HandleGameStart(playerId);
    }

    public async Task Move(int playerId, int dot, int[][] polygons, int[] currentOccupiedDots)
    {
        await Clients.All.HandleMove(playerId, dot, polygons, currentOccupiedDots);
    }

    public async Task SendTrapPolygon(int currentTurnPlayerId, int[] trapPolygon, int trappedDot, int trapPolygonOwnerId)
    {
        moveCompletions[trapPolygonOwnerId] = true;

        if (trapPolygon.Length != 0)
        {
            GameHub.trapPolygon = trapPolygon;
            GameHub.trappedDot = trappedDot;
            GameHub.trapPolygonOwnerId = trapPolygonOwnerId;
        }

        if (!moveCompletions.All(x => x)) return;

        var nextTurnPlayerId = currentTurnPlayerId;

        do
        {
            nextTurnPlayerId = (nextTurnPlayerId + 1) % roomSize;
        }
        while (!ConnectedPlayers[nextTurnPlayerId]);

        await Clients.All.HandleTrapPolygon(
            currentTurnPlayerId,
            GameHub.trapPolygon,
            GameHub.trappedDot,
            GameHub.trapPolygonOwnerId,
            nextTurnPlayerId
        );

        for (var i = 0; i < moveCompletions.Length; i++)
        {
            moveCompletions[i] = false;
        }

        GameHub.trapPolygon = [];
        GameHub.trappedDot = -1;
        GameHub.trapPolygonOwnerId = -1;
    }

    public override async Task OnConnectedAsync()
    {
        if (roomSize == MaxRoomSize)
        {
            await Clients.Caller.HandleError($"Room reached maximum number of players - {MaxRoomSize}!");
            return;
        }

        if (gameStarted)
        {
            await Clients.Caller.HandleError("Game has already started!");
            return;
        }

        ConnectionIdToPlayerId.TryAdd(Context.ConnectionId, roomSize);
        ConnectedPlayers[roomSize] = true;

        await Task.WhenAll(
            Clients.Caller.ReceivePlayerId(roomSize),
            Clients.Others.ReceiveNewPlayerId(roomSize)
        );

        roomSize++;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var removed = ConnectionIdToPlayerId.Remove(Context.ConnectionId, out var disconnectedPlayerId);

        if (!removed) return;

        if (!gameStarted)
        {
            foreach (var kvp in ConnectionIdToPlayerId)
            {
                if (kvp.Value > disconnectedPlayerId) ConnectionIdToPlayerId[kvp.Key]--;
            }
        }

        await Clients.Others.HandleDisconnectedPlayer(disconnectedPlayerId, gameStarted);

        roomSize--;

        if (!gameStarted)
        {
            ConnectedPlayers[roomSize] = false;
        }
        else
        {
            ConnectedPlayers[disconnectedPlayerId] = false;
        }
    }
}

public interface IGameHubClient
{
    Task ReceivePlayerId(int playerId);

    Task ReceiveNewPlayerId(int newPlayerId);

    Task HandleGameStart(int playerId);

    Task HandleMove(int playerId, int dot, int[][] polygons, int[] currentOccupiedDots);

    Task HandleTrapPolygon(int currentTurnPlayerId, int[] trapPolygon, int trappedDot, int trapPolygonOwnerId, int nextTurnPlayerId);

    Task HandleError(string message);

    Task HandleDisconnectedPlayer(int disconnectedPlayerId, bool gameStarted);
}