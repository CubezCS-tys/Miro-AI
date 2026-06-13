/* Python-in-the-browser execution worker (Pyodide / WebAssembly).
   Lives in public/ as plain JS so it loads without bundler involvement. */

const PYODIDE_VERSION = "0.29.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;

function getPyodide() {
  if (!pyodidePromise) {
    importScripts(`${PYODIDE_URL}pyodide.js`);
    pyodidePromise = loadPyodide({ indexURL: PYODIDE_URL }).then((py) => {
      self.postMessage({ type: "ready" });
      return py;
    });
  }
  return pyodidePromise;
}

self.onmessage = async (event) => {
  const { id, code } = event.data;
  const start = performance.now();
  let stdout = "";
  let stderr = "";
  try {
    const py = await getPyodide();
    py.setStdout({ batched: (s) => (stdout += s + "\n") });
    py.setStderr({ batched: (s) => (stderr += s + "\n") });

    // auto-fetch packages referenced by imports (numpy, pandas, ...)
    try {
      await py.loadPackagesFromImports(code);
    } catch {
      /* unknown imports fail in the run below with a normal Python error */
    }

    let exitCode = 0;
    try {
      await py.runPythonAsync(code);
    } catch (err) {
      stderr += String(err);
      exitCode = 1;
    }
    self.postMessage({
      type: "result",
      id,
      result: {
        stdout,
        stderr,
        exit_code: exitCode,
        duration_ms: Math.round(performance.now() - start),
        timed_out: false,
      },
    });
  } catch (err) {
    self.postMessage({
      type: "result",
      id,
      result: {
        stdout,
        stderr: "Sandbox failed to start: " + String(err),
        exit_code: -1,
        duration_ms: Math.round(performance.now() - start),
        timed_out: false,
      },
    });
  }
};
