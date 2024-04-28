import { List_set1 } from './native-js.js';

export function List_setLast<T>(self: Array<T>, x: T): T {
	return List_set1(self, self.length - 1, x);
}

export function int_compare1(self: number, x: number): number {
	return (x < self ? 1 : 0) - (x > self ? 1 : 0);
}

export let RELEASE = false;
