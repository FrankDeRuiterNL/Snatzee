import { prepareSheet, type PreparedSheet } from '@/lib/scoresheet/preprocess'
import { detectGrid, type SheetGrid } from '@/lib/scoresheet/grid'
import { suggestSheetCrop, type CropFractions } from '@/lib/scoresheet/locate'
import { readCells, type CellReading, type SheetReading } from '@/lib/scoresheet/cells'
import { readColumn, type ColumnReading } from '@/lib/scoresheet/read'
import type { BinaryImage } from '@/lib/scoresheet/preprocess'

/**
 * The scanner's heavy steps, as plain functions of plain data.
 *
 * The same code runs in the worker and, when a worker cannot be started,
 * on the main thread — so there is one pipeline, not two that can drift.
 */
export interface ScanOperations {
  locate: (image: ImageData) => CropFractions | null
  read: (image: ImageData) => {
    prepared: PreparedSheet
    grid: SheetGrid | null
    cells: SheetReading | null
  }
  column: (args: { mask: BinaryImage; cells: [CellReading[], CellReading[]] }) => ColumnReading | null
}

export const operations: ScanOperations = {
  locate: (image) => suggestSheetCrop(image),
  read: (image) => {
    const prepared = prepareSheet(image)
    const grid = detectGrid(prepared.mask)
    const cells = grid ? readCells(prepared.mask, grid) : null
    return { prepared, grid, cells }
  },
  column: ({ mask, cells }) => readColumn(mask, cells),
}

export type ScanOperation = keyof ScanOperations

export interface ScanRequest<K extends ScanOperation = ScanOperation> {
  id: number
  op: K
  input: Parameters<ScanOperations[K]>[0]
}

export type ScanResponse =
  | { id: number; ok: true; output: unknown }
  | { id: number; ok: false; error: string }
