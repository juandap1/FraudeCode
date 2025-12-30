import { render } from "ink";
import App from "./components/App";
import { resetLog } from "./utils/logger";

resetLog();
console.clear();
render(<App />);
