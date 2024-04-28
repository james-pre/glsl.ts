import { assert, StringMap_set2, StringMap_get11, StringMap_get3 } from '../native-js.js';
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
		assert(!this.symbols.has(symbol.name));
		StringMap_set2(this.symbols, symbol.name, symbol);
	}

	redefine(symbol: _Symbol): void {
		assert(this.symbols.has(symbol.name));
		assert(StringMap_get11(this.symbols, symbol.name) !== symbol);
		StringMap_set2(this.symbols, symbol.name, symbol);
	}

	find(name: string): _Symbol {
		let symbol = StringMap_get3(this.symbols, name, null);

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
