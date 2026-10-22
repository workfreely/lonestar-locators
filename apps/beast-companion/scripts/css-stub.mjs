// Let the Node test runner import a component that imports CSS.
//
// Vite turns `import "./calendar.css"` into a real stylesheet; Node has no idea what a .css file
// is and throws ERR_UNKNOWN_FILE_EXTENSION. This resolves such specifiers to an empty module so a
// test can mount the SHIPPED component — rather than the component having to avoid owning its
// styles just to stay testable. Styling itself is asserted against the stylesheet's text.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier.endsWith(".css")) {
          return { url: "data:text/javascript,export default {}", shortCircuit: true };
        }
        return next(specifier, context);
      }
    `),
  pathToFileURL("./"),
);
