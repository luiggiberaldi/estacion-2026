import { useState, useMemo } from 'react';

export function usePagination<T>(items: T[], itemsPerPage = 15) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, safePage, itemsPerPage]);

  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));
  const goNext = () => goToPage(safePage + 1);
  const goPrev = () => goToPage(safePage - 1);
  const resetPage = () => setCurrentPage(1);

  return {
    currentPage: safePage,
    totalPages,
    paginatedItems,
    goToPage,
    goNext,
    goPrev,
    resetPage,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    startIndex: (safePage - 1) * itemsPerPage + 1,
    endIndex: Math.min(safePage * itemsPerPage, items.length),
    totalItems: items.length,
  };
}
