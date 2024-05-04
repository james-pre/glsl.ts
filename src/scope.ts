import { _Symbol } from './symbol.js';

export const enum ScopeKind {
	FUNCTION,
	GLOBAL,
	LOCAL,
	LOOP,
	STRUCT,
}

export class Scope {
	kind: ScopeKind;
	parent: Scope;
	symbols: Map<string, _Symbol>;

	define(symbol: _Symbol): void {
		console.assert(!this.symbols.has(symbol.name));
		this.symbols.set(symbol.name, symbol);
	}

	redefine(symbol: _Symbol): void {
		console.assert(this.symbols.has(symbol.name));
		console.assert(this.symbols.get(symbol.name) !== symbol);
		this.symbols.set(symbol.name, symbol);
	}

	find(name: string): _Symbol {
		const symbol = this.symbols.get(name) ?? null;

		if (symbol !== null) {
			return symbol;
		}

		if (this.parent !== null) {
			return this.parent.find(name);
		}

		return null;
	}

	constructor(kind: ScopeKind, parent: Scope) {
		this.kind = kind;
		this.parent = parent;
		this.symbols = new Map();
	}
}
