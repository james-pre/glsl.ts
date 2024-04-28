import { List_set1, assert, List_get2 } from '../native-js.js';

export class UnionFind {
	parents: Array<number>;

	allocate1(): number {
		let index = this.parents.length;
		this.parents.push(index);
		return index;
	}

	union(left: number, right: number): void {
		List_set1(this.parents, this.find(left), this.find(right));
	}

	find(index: number): number {
		assert(index >= 0 && index < this.parents.length);
		let parent = List_get2(this.parents, index);

		if (parent !== index) {
			parent = this.find(parent);
			List_set1(this.parents, index, parent);
		}

		return parent;
	}

	constructor() {
		this.parents = [];
	}
}
