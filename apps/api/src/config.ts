const rawPort = process.env.PORT;
if (rawPort === undefined || rawPort.trim() === "") {
  throw new Error("Port not provided");
}
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Port must be an integer between 1 and 65535");
}

export const config = { port };
