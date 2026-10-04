/** Zadania startowe serwera. Warunek w tej postaci pozwala pominąć kod Node.js w kompilacji dla edge (next dev). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
