#:sdk Microsoft.NET.Sdk.Web

using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder();

var app = builder.Build();

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Directory.GetCurrentDirectory())
});

app.MapGet("/", () => "Hello world");

app.Run("http://0.0.0.0:5000");