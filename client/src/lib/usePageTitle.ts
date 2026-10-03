import { useEffect } from 'react';

const BRAND = 'Global Traders FX';

/** Título de la pestaña del navegador: «Página · Global Traders FX». */
export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND}` : BRAND;
  }, [title]);
}

export default usePageTitle;
