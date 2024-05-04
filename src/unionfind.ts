export class UnionFind {
	parents: number[];

	allocate1(): number {
		const index = this.parents.length;
		this.parents.push(index);
		return index;
	}

	union(left: number, right: number): void {
		this.parents[this.find(left)] = this.find(right);
	}

	find(index: number): number {
		console.assert(index >= 0 && index < this.parents.length);
		let parent = this.parents[index];

		if (parent !== index) {
			parent = this.find(parent);
			this.parents[index] = parent;
		}

		return parent;
	}

	constructor() {
		this.parents = [];
	}
}
