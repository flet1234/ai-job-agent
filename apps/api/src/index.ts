import { config } from "./config.js";
import { app } from "./app.js";

app.listen(config.port, config.LOCAL_ADDRESS, () => {
  console.log(`API listening on http://${config.LOCAL_ADDRESS}:${config.port}`);
});
