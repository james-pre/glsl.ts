import { IntMap_get12, IntMap_insert2 } from '../native-js.js';

export const enum Color {
	DEFAULT,
	BOLD,
	GRAY,
	RED,
	GREEN,
	YELLOW,
	BLUE,
	MAGENTA,
	CYAN,
}

export function setColor(color: Color): void {
	if (process.stdout.isTTY) {
		write(`\x1B[0;${Color_toEscapeCode(color)}m`);
	}
}

export function width(): number {
	return process.stdout.columns;
}

export function print(text: string): void {
	write(text + '\n');
}

export function write(text: string): void {
	process.stdout.write(text);
}

export function Color_toEscapeCode(self: Color): number {
	return IntMap_get12(colorToEscapeCode, self);
}

export let colorToEscapeCode = IntMap_insert2(
	IntMap_insert2(
		IntMap_insert2(
			IntMap_insert2(
				IntMap_insert2(
					IntMap_insert2(IntMap_insert2(IntMap_insert2(IntMap_insert2(new Map(), Color.DEFAULT, 0), Color.BOLD, 1), Color.GRAY, 90), Color.RED, 31),
					Color.GREEN,
					32
				),
				Color.YELLOW,
				33
			),
			Color.BLUE,
			34
		),
		Color.MAGENTA,
		35
	),
	Color.CYAN,
	36
);
