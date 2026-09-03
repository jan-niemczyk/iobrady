declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    fonts: Record<string, unknown>;
    vfs: Record<string, string>;
    createPdf: (docDefinition: unknown) => {
      download: (defaultFileName?: string) => void;
      open: () => void;
      getBlob: (cb: (blob: Blob) => void) => void;
    };
  };
  export default pdfMake;
}
