import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  label?: string;
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  label = "registros"
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-1 py-3 border-t border-border/50 mt-2">
      <p className="text-sm text-muted-foreground">
        Mostrando {startIndex}–{endIndex} de {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft className="size-4 mr-1" /> Anterior
        </Button>
        <span className="text-sm font-medium text-muted-foreground min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
          Siguiente <ChevronRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
