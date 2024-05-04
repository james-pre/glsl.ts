import { Node } from './node.js';
import { Range } from './range.js';
import { Scope } from './scope.js';
import { Type } from './type.js';

export enum SymbolFlags {
	NULL = 0,
	// Keyword modifiers
	ATTRIBUTE = 1,
	CONST,
	HIGHP = 4,
	IN = 8,
	INOUT = 16,
	LOWP = 32,
	MEDIUMP = 64,
	OUT = 128,
	UNIFORM = 256,
	VARYING = 512,

	// Internal compiler flags
	EXPORTED = 1024,
	IMPORTED = 2048,
}

export class _Symbol {
	id: number;
	range: Range;
	name: string;
	scope: Scope;
	flags: SymbolFlags;
	comments: Array<string>;
	constantValue: Node;
	requiredExtension: string;
	_resolvedType: Type;
	useCount: number;

	isConst(): boolean {
		return (SymbolFlags.CONST & this.flags) !== 0;
	}

	isUniform(): boolean {
		return (SymbolFlags.UNIFORM & this.flags) !== 0;
	}

	isAttributeOrUniform(): boolean {
		return ((SymbolFlags.ATTRIBUTE | SymbolFlags.UNIFORM) & this.flags) !== 0;
	}

	// Internal compiler flags
	isImported(): boolean {
		return (SymbolFlags.IMPORTED & this.flags) !== 0;
	}

	isExported(): boolean {
		return (SymbolFlags.EXPORTED & this.flags) !== 0;
	}

	isImportedOrExported(): boolean {
		return ((SymbolFlags.IMPORTED | SymbolFlags.EXPORTED) & this.flags) !== 0;
	}

	isStruct(): boolean {
		return this instanceof StructSymbol;
	}

	isFunction(): boolean {
		return this instanceof FunctionSymbol;
	}

	isVariable(): boolean {
		return this instanceof VariableSymbol;
	}

	isArgumentOrLocalVariable(): boolean {
		return this.isVariable() && (this.asVariable().kind === VariableKind.ARGUMENT || this.asVariable().kind === VariableKind.LOCAL);
	}

	isNative(): boolean {
		return this.id < 0;
	}

	asStruct(): StructSymbol {
		console.assert(this.isStruct());
		return this as unknown as StructSymbol;
	}

	asFunction(): FunctionSymbol {
		console.assert(this.isFunction());
		return this as unknown as FunctionSymbol;
	}

	asVariable(): VariableSymbol {
		console.assert(this.isVariable());
		return this as unknown as VariableSymbol;
	}

	resolvedType(): Type {
		if (this._resolvedType === null) {
			this._resolvedType = new Type(this, null, 0);
		}

		return this._resolvedType;
	}

	constructor(id: number, range: Range, name: string, scope: Scope) {
		this.id = id;
		this.range = range;
		this.name = name;
		this.scope = scope;
		this.flags = 0 as SymbolFlags;
		this.comments = null;
		this.constantValue = null;
		this.requiredExtension = null;
		this._resolvedType = null;
		this.useCount = 0;
	}
}

export class StructSymbol extends _Symbol {
	variables: Array<VariableSymbol>;

	constructor(id: number, range: Range, name: string, scope: Scope) {
		super(id, range, name, scope);
		this.variables = [];
	}
}

export class FunctionSymbol extends _Symbol {
	_arguments: Array<VariableSymbol>;
	returnType: Node;
	block: Node;
	previousOverload: FunctionSymbol;

	sibling: FunctionSymbol; // Forward-declared functions are linked to their implementation and vice versa

	hasSameArgumentTypesAs(_function: FunctionSymbol): boolean {
		if (this._arguments.length !== _function._arguments.length) {
			return false;
		}

		for (let i = 0, count = this._arguments.length; i < count; i++) {
			if (this._arguments[i].type.resolvedType !== _function._arguments[i].type.resolvedType) {
				return false;
			}
		}

		return true;
	}

	constructor(id: number, range: Range, name: string, scope: Scope) {
		super(id, range, name, scope);
		this._arguments = [];
		this.returnType = null;
		this.block = null;
		this.previousOverload = null;
		this.sibling = null;
	}
}

export const enum VariableKind {
	ARGUMENT,
	GLOBAL,
	LOCAL,
	STRUCT,
}

export class VariableSymbol extends _Symbol {
	kind: VariableKind;
	type: Node;
	node: Node;
	arrayCount: Node;

	value(): Node {
		let ref: Node;
		return (ref = this.node) !== null ? ref.variableInitializer() : null;
	}

	constructor(id: number, range: Range, name: string, scope: Scope, kind: VariableKind) {
		super(id, range, name, scope);
		this.kind = kind;
		this.type = null;
		this.node = null;
		this.arrayCount = null;
	}
}

export function SymbolFlags_toString(self: SymbolFlags): string {
	let text = '';

	if ((SymbolFlags.ATTRIBUTE & self) !== 0) {
		text += 'attribute ';
	}

	if ((SymbolFlags.CONST & self) !== 0) {
		text += 'const ';
	}

	if ((SymbolFlags.UNIFORM & self) !== 0) {
		text += 'uniform ';
	}

	if ((SymbolFlags.VARYING & self) !== 0) {
		text += 'varying ';
	}

	if ((SymbolFlags.HIGHP & self) !== 0) {
		text += 'highp ';
	}

	if ((SymbolFlags.LOWP & self) !== 0) {
		text += 'lowp ';
	}

	if ((SymbolFlags.MEDIUMP & self) !== 0) {
		text += 'mediump ';
	}

	if ((SymbolFlags.IN & self) !== 0) {
		text += 'in ';
	}

	if ((SymbolFlags.INOUT & self) !== 0) {
		text += 'inout ';
	}

	if ((SymbolFlags.OUT & self) !== 0) {
		text += 'out ';
	}

	return text;
}
