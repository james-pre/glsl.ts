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

export function Color_toEscapeCode(color: Color): number {
	console.assert(colorToEscapeCode.has(color));
	return colorToEscapeCode.get(color);
}

export const colorToEscapeCode = new Map();
colorToEscapeCode.set(Color.DEFAULT, 0);
colorToEscapeCode.set(Color.BOLD, 1);
colorToEscapeCode.set(Color.GRAY, 90);
colorToEscapeCode.set(Color.RED, 31);
colorToEscapeCode.set(Color.GREEN, 32);
colorToEscapeCode.set(Color.YELLOW, 33);
colorToEscapeCode.set(Color.BLUE, 34);
colorToEscapeCode.set(Color.MAGENTA, 35);
colorToEscapeCode.set(Color.CYAN, 36);
