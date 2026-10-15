const rawPort = process.env.PORT;
if (rawPort === undefined || rawPort.trim() === "") {
  throw new Error("Port not provided");
}
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Port must be an integer between 1 and 65535");
}

const LOCAL_ADDRESS = "127.0.0.1";

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey || openaiApiKey.trim() === "") {
  throw new Error("openaiApiKey not provided");
}

const llmModel = process.env.MODEL;
if (!llmModel || llmModel.trim() === "") {
  throw new Error("llmModel not provided");
}
export const config = { port, LOCAL_ADDRESS, openaiApiKey, llmModel };
