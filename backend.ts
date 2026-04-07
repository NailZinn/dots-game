import { serveFile } from "jsr:@std/http@1.0.25/file-server";

Deno.serve({ hostname: "0.0.0.0", port: 5000 }, async (req: Request) => {
  const path = new URL(req.url).pathname;

  console.log(path);

  try {
    const filePath = path.slice(1);
    const fileInfo = await Deno.lstat(filePath);
    
    if (fileInfo.isFile) {
      return serveFile(req, filePath);
    }
  }
  // deno-lint-ignore no-empty
  catch (_) {}
  
  if (path === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => console.log("connected");

    socket.onmessage = (event) => console.log(event);
    
    return response;
  }
  
  return new Response("Not Found", { status: 404 });
});