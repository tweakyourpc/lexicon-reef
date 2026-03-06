export class UniformGrid {
  private readonly width: number;
  private readonly height: number;
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];

  constructor(width: number, height: number, cellSize: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.cellSize = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(this.width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(this.height / this.cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const cell of this.cells) {
      cell.length = 0;
    }
  }

  insert(id: number, x: number, y: number): void {
    const index = this.cellIndexForPoint(x, y);
    this.cells[index].push(id);
  }

  queryNeighbors(x: number, y: number): number[] {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));
    const neighbors: number[] = [];

    for (let r = row - 1; r <= row + 1; r += 1) {
      if (r < 0 || r >= this.rows) {
        continue;
      }
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (c < 0 || c >= this.cols) {
          continue;
        }
        const cell = this.cells[this.cellIndex(c, r)];
        for (const id of cell) {
          neighbors.push(id);
        }
      }
    }

    return neighbors;
  }

  private cellIndexForPoint(x: number, y: number): number {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));
    return this.cellIndex(col, row);
  }

  private cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  private clampCol(col: number): number {
    return Math.max(0, Math.min(this.cols - 1, col));
  }

  private clampRow(row: number): number {
    return Math.max(0, Math.min(this.rows - 1, row));
  }
}
