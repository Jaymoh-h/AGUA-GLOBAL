const app = require("./app");
const { port } = require("./config/env");

app.listen(port, () => {
  console.log(`AGUA Global API running on http://localhost:${port}`);
});

