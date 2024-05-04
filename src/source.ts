import { Range } from './range.js';
import { Token } from './tokenizer.js';

export interface LineColumn {
	line: number;
	column: number;
}

export class Source {
	public tokens: Token[];

	// This maps line numbers to indices within contents
	protected _lineOffsets: number[] = [0];

	public constructor(
		public readonly name: string,
		public readonly contents: string
	) {}

	public entireRange(): Range {
		return new Range(this, 0, this.contents.length);
	}

	public contentsOfLine(line: number): string {
		this._computeLineOffsets();

		if (line < 0 || line >= this._lineOffsets.length) {
			return '';
		}

		const end = line + 1 < this._lineOffsets.length ? this._lineOffsets[line + 1] - 1 : this.contents.length;
		return this.contents.slice(this._lineOffsets[line], end);
	}

	public indexToLineColumn(index: number): LineColumn {
		this._computeLineOffsets();

		// Binary search to find the line
		let count = this._lineOffsets.length;
		let line = 0;

		while (count > 0) {
			const step = count / 2;
			const i = line + step;

			if (this._lineOffsets[i] <= index) {
				line = i + 1;
				count -= step + 1;
			} else {
				count = step;
			}
		}

		// Use the line to compute the column
		const column = line == 0 ? index : index - this._lineOffsets[line - 1];
		line--;
		return { line, column };
	}

	public lineColumnToIndex(line: number, column: number): number {
		this._computeLineOffsets();

		if (line >= 0 && line < this._lineOffsets.length) {
			const index = this._lineOffsets[line];

			if (column >= 0 && index + column < (line + 1 < this._lineOffsets.length ? this._lineOffsets[line + 1] : this.contents.length)) {
				return index + column;
			}
		}

		return -1;
	}

	protected _computeLineOffsets(): void {
		if (this._lineOffsets) {
			return;
		}

		for (let i = 0; i < this.contents.length; i++) {
			if (this.contents[i] == '\n') {
				this._lineOffsets.push(i + 1);
			}
		}
	}
}
