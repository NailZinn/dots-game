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
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.Ping("ok");
    }
}

public interface IGameHubClient
{
    Task Ping(string message);
}