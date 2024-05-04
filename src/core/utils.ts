export function compare(a: number, b: number): number {
	return +(b < a) - +(b > a);
}

export function compare_string(a: string, b: string): number {
	return (+(b < a) | 0) - (+(b > a) | 0);
}
