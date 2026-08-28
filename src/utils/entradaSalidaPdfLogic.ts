export const ROWS_SPLIT = 6;
export const ROWS_FULL = 22;

export function isMexicoMROClient(cliente?: string): boolean {
  if (!cliente) return false;
  const n = cliente.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (n.includes("mexico") || n.includes("mx")) && n.includes("mro");
}

export function planSalidaPdfPages(cliente: string, itemCount: number) {
  const fullPage = isMexicoMROClient(cliente);
  const rowsPerPage = fullPage ? ROWS_FULL : ROWS_SPLIT;
  const contentPages = Math.max(1, Math.ceil(Math.max(itemCount, 1) / rowsPerPage));
  const printedPages = fullPage ? contentPages * 2 : contentPages;
  return { fullPage, rowsPerPage, contentPages, printedPages };
}
