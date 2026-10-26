// Mermaid utiliza DOMPurify até na análise de alguns tipos de diagrama.
// O DOM é isolado no servidor e nunca executa scripts nem carrega recursos.
let parser;
export async function parseDiagram(source) {
  if (!parser)
    parser = (async () => {
      const { JSDOM } = await import("jsdom");
      const dom = new JSDOM("");
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        maxTextSize: 24000,
        suppressErrorRendering: true,
      });
      return mermaid;
    })();
  return (await parser).parse(source);
}
