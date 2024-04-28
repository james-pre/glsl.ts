export class StringBuilder {
	buffer: string;

	constructor() {
		this.buffer = '';
	}
}

export function assert(truth: boolean): void {
	if (!truth) {
		throw Error('Assertion failed');
	}
}

export function List_set1<T>(self: Array<T>, index: number, value: T): T {
	assert(0 <= index && index < self.length);
	return (self[index] = value);
}

export function List_removeLast<T>(self: Array<T>): void {
	assert(!(self.length === 0));
	self.pop();
}

export function List_get2<T>(self: Array<T>, index: number): T {
	assert(0 <= index && index < self.length);
	return self[index];
}

export function List_last<T>(self: Array<T>): T {
	assert(!(self.length === 0));
	return List_get2(self, self.length - 1);
}

export function List_append2<T>(self: Array<T>, values: Array<T>): void {
	assert(values !== self);

	for (const value of values) {
		self.push(value);
	}
}

export function List_removeIf<T>(self: Array<T>, callback: (v0: T) => boolean): void {
	let index = 0;

	// Remove elements in place
	for (let i = 0, count1 = self.length; i < count1; i = i + 1) {
		if (!callback(List_get2(self, i))) {
			if (index < i) {
				List_set1(self, index, List_get2(self, i));
			}

			index = index + 1;
		}
	}

	// Shrink the array to the correct size
	while (index < self.length) {
		List_removeLast(self);
	}
}

export function List_slice11<T>(self: Array<T>, start: number): Array<T> {
	assert(0 <= start && start <= self.length);
	return self.slice(start);
}

export function List_slice21<T>(self: Array<T>, start: number, end: number): Array<T> {
	assert(0 <= start && start <= end && end <= self.length);
	return self.slice(start, end);
}

export function List_first<T>(self: Array<T>): T {
	assert(!(self.length === 0));
	return List_get2(self, 0);
}

export function List_takeLast<T>(self: Array<T>): T {
	assert(!(self.length === 0));
	return self.pop();
}

export function StringMap_set2<T>(self: Map<string, T>, key: string, value: T): T {
	self.set(key, value);
	return value;
}

export function StringMap_insert1<T>(self: Map<string, T>, key: string, value: T): Map<string, T> {
	self.set(key, value);
	return self;
}

export function StringMap_get3<T>(self: Map<string, T>, key: string, defaultValue: T): T {
	let value: any = self.get(key);

	return value !== void 0 ? value : defaultValue; // Compare against undefined so the key is only hashed once for speed
}

export function StringMap_get11<T>(self: Map<string, T>, key: string): T {
	assert(self.has(key));
	return self.get(key);
}

export function IntMap_set3<T>(self: Map<number, T>, key: number, value: T): T {
	self.set(key, value);
	return value;
}

export function IntMap_insert2<T>(self: Map<number, T>, key: number, value: T): Map<number, T> {
	self.set(key, value);
	return self;
}

export function IntMap_get4<T>(self: Map<number, T>, key: number, defaultValue: T): T {
	let value: any = self.get(key);

	return value !== void 0 ? value : defaultValue; // Compare against undefined so the key is only hashed once for speed
}

export function IntMap_get12<T>(self: Map<number, T>, key: number): T {
	assert(self.has(key));
	return self.get(key);
}

export function string_compare2(self: string, x: string): number {
	return ((x < self) | 0) - ((x > self) | 0);
}

export function string_repeat(self: string, times: number): string {
	let result = '';

	for (let i = 0, count1 = times; i < count1; i = i + 1) {
		result += self;
	}

	return result;
}

export function string_slice12(self: string, start: number): string {
	assert(0 <= start && start <= self.length);
	return self.slice(start);
}

export function string_slice22(self: string, start: number, end: number): string {
	assert(0 <= start && start <= end && end <= self.length);
	return self.slice(start, end);
}

export function string_get13(self: string, index: number): number {
	assert(0 <= index && index < self.length);
	return self.charCodeAt(index);
}

export function string_get5(self: string, index: number): string {
	assert(0 <= index && index < self.length);
	return self[index];
}

export let __isInt: (v0: any) => boolean = (value: any) => {
	return value === (value | 0);
};
export let __asString: (v0: any) => any = (value: any) => {
	return value === null ? value : value + '';
};
