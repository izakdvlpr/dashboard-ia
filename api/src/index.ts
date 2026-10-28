import { createApp } from "./app.ts";

createApp().listen(3333, () => {
	console.log("API em http://localhost:3333");
});
