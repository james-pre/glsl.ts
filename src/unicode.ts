export class StringIterator {
	value: string;
	index: number;
	stop: number;
	static INSTANCE = new StringIterator();

	reset(text: string, start: number): StringIterator {
		this.value = text;
		this.index = start;
		this.stop = text.length;
		return this;
	}

	nextCodePoint(): number {
		if (this.index >= this.stop) {
			return -1;
		}

		this.index++;
		const a = this.value.charCodeAt(this.index - 1);

		if ((a & 64512) !== 55296) {
			return a;
		}

		if (this.index >= this.stop) {
			return -1;
		}

		this.index++;
		const b = this.value.charCodeAt(this.index - 1);
		return (a << 10) + b + (65536 - (55296 << 10) - 56320);
	}

	constructor() {
		this.value = '';
		this.index = 0;
		this.stop = 0;
	}
}

export function string_fromCodePoints(codePoints: number[]): string {
	let string = '';

	for (const codePoint of codePoints) {
		string += string_fromCodePoint(codePoint);
	}

	return string;
}

export function string_fromCodePoint(codePoint: number): string {
	return codePoint < 65536
		? String.fromCharCode(codePoint)
		: String.fromCharCode(((codePoint - 65536) >> 10) + 55296) + String.fromCharCode(((codePoint - 65536) & ((1 << 10) - 1)) + 56320);
}
