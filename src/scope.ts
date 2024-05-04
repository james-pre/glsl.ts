import { BaseSymbol } from './symbol.js';

export const enum ScopeKind {
	FUNCTION,
	GLOBAL,
	LOCAL,
	LOOP,
	STRUCT,
}

export class Scope {
	public symbols: Map<string, BaseSymbol> = new Map();

	constructor(
		public kind: ScopeKind,
		public parent?: Scope
	) {}
	define(symbol: BaseSymbol): void {
		console.assert(!this.symbols.has(symbol.name));
		this.symbols.set(symbol.name, symbol);
	}

	redefine(symbol: BaseSymbol): void {
		console.assert(this.symbols.has(symbol.name));
		console.assert(this.symbols.get(symbol.name) !== symbol);
		this.symbols.set(symbol.name, symbol);
	}

	find(name: string): BaseSymbol {
		const symbol = this.symbols.get(name);

		if (symbol) {
			return symbol;
		}

		if (this.parent) {
			return this.parent.find(name);
		}
	}
}
