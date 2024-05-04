import { Range } from './range.js';
import { Token } from './tokenizer.js';

export class LineColumn {
	line: number; // 0-based index

	column: number; // 0-based index

	constructor(line: number, column: number) {
		this.line = line;
		this.column = column;
	}
}

export class Source {
	name: string;
	contents: string;
	tokens: Array<Token>;

	// This maps line numbers to indices within contents
	_lineOffsets: Array<number>;

	entireRange(): Range {
		return new Range(this, 0, this.contents.length);
	}

	contentsOfLine(line: number): string {
		this._computeLineOffsets();

		if (line < 0 || line >= this._lineOffsets.length) {
			return '';
		}

		const start = this._lineOffsets[line];
		const end = line + 1 < this._lineOffsets.length ? this._lineOffsets[line + 1] - 1 : this.contents.length;
		return this.contents.slice(start, end);
	}

	indexToLineColumn(index: number): LineColumn {
		this._computeLineOffsets();

		// Binary search to find the line
		let count = this._lineOffsets.length;
		let line = 0;

		while (count > 0) {
			const step = (count / 2) | 0;
			const i = line + step;

			if (this._lineOffsets[i] <= index) {
				line = i + 1;
				count = count - step - 1;
			} else {
				count = step;
			}
		}

		// Use the line to compute the column
		const column = line > 0 ? index - this._lineOffsets[line - 1] : index;
		return new LineColumn(line - 1, column);
	}

	lineColumnToIndex(line: number, column: number): number {
		this._computeLineOffsets();

		if (line >= 0 && line < this._lineOffsets.length) {
			const index = this._lineOffsets[line];

			if (column >= 0 && index + column < (line + 1 < this._lineOffsets.length ? this._lineOffsets[line + 1] : this.contents.length)) {
				return index + column;
			}
		}

		return -1;
	}

	_computeLineOffsets(): void {
		if (this._lineOffsets === null) {
			this._lineOffsets = [0];

			for (let i = 0, count = this.contents.length; i < count; i++) {
				if (this.contents.charCodeAt(i) === 10) {
					this._lineOffsets.push(i + 1);
				}
			}
		}
	}

	constructor(name: string, contents: string) {
		this.name = name;
		this.contents = contents;
		this.tokens = null;
		this._lineOffsets = null;
	}
}
