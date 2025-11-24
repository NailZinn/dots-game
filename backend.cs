#:sdk Microsoft.NET.Sdk.Web
#:property PublishAOT=false

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

    private static bool gameStarted = false;
    private static int roomSize = 0;

    public async Task StartGame()
    {
        if (gameStarted) return;

        if (roomSize < 2)
        {
            await Clients.Caller.HandleError("At least 2 players required to start the game!");
            return;
        }

        gameStarted = true;

        await Clients.Caller.HandleGameStart();
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

        await Task.WhenAll(
            Clients.Caller.ReceivePlayerId(roomSize, roomSize),
            Clients.Others.ReceiveNewPlayerId(roomSize)
        );

        roomSize++;
    }
}

public interface IGameHubClient
{
    Task ReceivePlayerId(int playerId, int roomSize);

    Task ReceiveNewPlayerId(int newPlayerId);

    Task HandleGameStart();

    Task HandleError(string message);
}