import { LineColumn, Source } from './source.js';
import { StringIterator, string_fromCodePoints } from '../unicode.js';
import { string_slice22, assert, List_slice21, string_repeat } from '../native-js.js';

export class FormattedRange {
	line: string;
	range: string;

	constructor(line: string, range: string) {
		this.line = line;
		this.range = range;
	}
}

export class Range {
	source: Source;
	start: number;
	end: number;

	toString(): string {
		return string_slice22(this.source.contents, this.start, this.end);
	}

	locationString(): string {
		let location = this.source.indexToLineColumn(this.start);
		return `${this.source.name}:${location.line + 1}:${location.column + 1}`;
	}

	overlaps(range: Range): boolean {
		return this.source === range.source && this.start < range.end && range.start < this.end;
	}

	touches(index: number): boolean {
		return this.start <= index && index <= this.end;
	}

	format(maxLength: number): FormattedRange {
		assert(this.source !== null);
		let start = this.source.indexToLineColumn(this.start);
		let end = this.source.indexToLineColumn(this.end);
		let line = this.source.contentsOfLine(start.line);
		let startColumn = start.column;
		let endColumn = end.line === start.line ? end.column : line.length;

		// Use a unicode iterator to count the actual code points so they don't get sliced through the middle
		let iterator = StringIterator.INSTANCE.reset(line, 0);
		let codePoints: Array<number> = [];
		let a = 0;
		let b = 0;

		// Expand tabs into spaces
		while (true) {
			if (iterator.index === startColumn) {
				a = codePoints.length;
			}

			if (iterator.index === endColumn) {
				b = codePoints.length;
			}

			let codePoint = iterator.nextCodePoint();

			if (codePoint < 0) {
				break;
			}

			if (codePoint === 9) {
				for (let space = 0, count1 = 8 - (codePoints.length % 8); space < count1; space = space + 1) {
					codePoints.push(32);
				}
			} else {
				codePoints.push(codePoint);
			}
		}

		// Ensure the line length doesn't exceed maxLength
		let count = codePoints.length;

		if (maxLength > 0 && count > maxLength) {
			let centeredWidth = Math.min(b - a, (maxLength / 2) | 0);
			let centeredStart = Math.max(((maxLength - centeredWidth) / 2) | 0, 3);

			// Left aligned
			if (a < centeredStart) {
				line = string_fromCodePoints(List_slice21(codePoints, 0, maxLength - 3)) + '...';

				if (b > maxLength - 3) {
					b = maxLength - 3;
				}
			}

			// Right aligned
			else if (count - a < maxLength - centeredStart) {
				let offset = count - maxLength;
				line = '...' + string_fromCodePoints(List_slice21(codePoints, offset + 3, count));
				a = a - offset;
				b = b - offset;
			}

			// Center aligned
			else {
				let offset1 = a - centeredStart;
				line = '...' + string_fromCodePoints(List_slice21(codePoints, offset1 + 3, offset1 + maxLength - 3)) + '...';
				a = a - offset1;
				b = b - offset1;

				if (b > maxLength - 3) {
					b = maxLength - 3;
				}
			}
		} else {
			line = string_fromCodePoints(codePoints);
		}

		return new FormattedRange(line, string_repeat(' ', a) + (b - a < 2 ? '^' : string_repeat('~', b - a)));
	}

	slice(offsetStart: number, offsetEnd: number): Range {
		assert(offsetStart >= 0 && offsetStart <= offsetEnd && offsetEnd <= this.end - this.start);
		return new Range(this.source, this.start + offsetStart, this.start + offsetEnd);
	}

	lineColumn(): LineColumn {
		return this.source.indexToLineColumn(this.start);
	}

	rangeAtEnd(): Range {
		return new Range(this.source, this.end, this.end);
	}

	static span(start: Range, end: Range): Range {
		assert(start.source === end.source);
		assert(start.start <= end.end);
		return new Range(start.source, start.start, end.end);
	}

	constructor(source: Source, start: number, end: number) {
		this.source = source;
		this.start = start;
		this.end = end;
	}
}
