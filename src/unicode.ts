import { StringBuilder, string_get13 } from './native-js.js';

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

		let a = string_get13(this.value, (this.index = this.index + 1) + -1);

		if ((a & 64512) !== 55296) {
			return a;
		}

		if (this.index >= this.stop) {
			return -1;
		}

		let b = string_get13(this.value, (this.index = this.index + 1) + -1);
		return (a << 10) + b + (65536 - (55296 << 10) - 56320);
	}

	constructor() {
		this.value = '';
		this.index = 0;
		this.stop = 0;
	}
}

export function string_fromCodePoints(codePoints: Array<number>): string {
	let builder = new StringBuilder();

	for (const codePoint of codePoints) {
		builder.buffer += string_fromCodePoint(codePoint);
	}

	return builder.buffer;
}

export function string_fromCodePoint(codePoint: number): string {
	return codePoint < 65536
		? String.fromCharCode(codePoint)
		: String.fromCharCode(((codePoint - 65536) >> 10) + 55296) + String.fromCharCode(((codePoint - 65536) & ((1 << 10) - 1)) + 56320);
}
