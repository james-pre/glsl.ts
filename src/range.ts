import { LineColumn, Source } from './source.js';

const iterator = {
	value: '',
	index: 0,
	stop: 0,
};

function nextCodePoint(): number {
	if (iterator.index >= iterator.stop) {
		return -1;
	}

	iterator.index++;
	const a = iterator.value.charCodeAt(iterator.index - 1);

	if ((a & 64512) !== 55296) {
		return a;
	}

	if (iterator.index >= iterator.stop) {
		return -1;
	}

	iterator.index++;
	const b = iterator.value.charCodeAt(iterator.index - 1);
	return (a << 10) + b + (65536 - (55296 << 10) - 56320);
}

function fromCodePoints(codePoints: number[]): string {
	let string = '';

	for (const codePoint of codePoints) {
		string += fromCodePoint(codePoint);
	}

	return string;
}

function fromCodePoint(codePoint: number): string {
	return codePoint < 65536
		? String.fromCharCode(codePoint)
		: String.fromCharCode(((codePoint - 65536) >> 10) + 55296) + String.fromCharCode(((codePoint - 65536) & ((1 << 10) - 1)) + 56320);
}

export interface FormattedRange {
	line: string;
	range: string;
}

export class Range {
	public constructor(
		public source: Source,
		public start: number,
		public end: number
	) {}

	public toString(): string {
		return this.source.contents.slice(this.start, this.end);
	}

	public locationString(): string {
		const location = this.source.indexToLineColumn(this.start);
		return `${this.source.name}:${location.line + 1}:${location.column + 1}`;
	}

	public overlaps(range: Range): boolean {
		return this.source === range.source && this.start < range.end && range.start < this.end;
	}

	public touches(index: number): boolean {
		return this.start <= index && index <= this.end;
	}

	public format(maxLength: number): FormattedRange {
		console.assert(this.source !== null);
		const start = this.source.indexToLineColumn(this.start);
		const end = this.source.indexToLineColumn(this.end);
		let line = this.source.contentsOfLine(start.line);
		const endColumn = end.line === start.line ? end.column : line.length;

		// Use a unicode iterator to count the actual code points so they don't get sliced through the middle
		iterator.value = line;
		iterator.index = 0;
		const codePoints: number[] = [];
		let a = 0;
		let b = 0;
		let codePoint: number;

		// Expand tabs into spaces
		while (codePoint >= 0) {
			codePoint = nextCodePoint();

			if (codePoint === 9) {
				for (let space = 0; space < 8 - (codePoints.length % 8); space++) {
					codePoints.push(32);
				}
			} else {
				codePoints.push(codePoint);
			}

			if (iterator.index === start.column) {
				a = codePoints.length;
			}

			if (iterator.index === endColumn) {
				b = codePoints.length;
			}
		}

		if (maxLength <= 0 || maxLength > codePoints.length) {
			return {
				line: fromCodePoints(codePoints),
				range: ' '.repeat(a) + (b - a < 2 ? '^' : '~'.repeat(b - a)),
			};
		}

		const centeredWidth = Math.min(b - a, (maxLength / 2) | 0);
		const centeredStart = Math.max(((maxLength - centeredWidth) / 2) | 0, 3);

		// Left aligned
		if (a < centeredStart) {
			line = fromCodePoints(codePoints.slice(0, maxLength - 3)) + '...';

			b = Math.min(b, maxLength - 3);
		}

		// Right aligned
		else if (codePoints.length - a < maxLength - centeredStart) {
			const offset = codePoints.length - maxLength;
			line = '...' + fromCodePoints(codePoints.slice(offset + 3, codePoints.length));
			a -= offset;
			b -= offset;
		}

		// Center aligned
		else {
			const offset = a - centeredStart;
			line = '...' + fromCodePoints(codePoints.slice(offset + 3, offset + maxLength - 3)) + '...';
			a -= offset;
			b = Math.min(b - offset, maxLength - 3);
		}

		return {
			line,
			range: ' '.repeat(a) + (b - a < 2 ? '^' : '~'.repeat(b - a)),
		};
	}

	public slice(start: number, end: number): Range {
		console.assert(start >= 0 && start <= end && end <= this.end - this.start);
		return new Range(this.source, this.start + start, this.start + end);
	}

	public lineColumn(): LineColumn {
		return this.source.indexToLineColumn(this.start);
	}

	public rangeAtEnd(): Range {
		return new Range(this.source, this.end, this.end);
	}

	public static span(start: Range, end: Range): Range {
		console.assert(start.source === end.source);
		console.assert(start.start <= end.end);
		return new Range(start.source, start.start, end.end);
	}
}
