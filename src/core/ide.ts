import { int_compare1 } from '../native.js';
import {
	List_first,
	List_get2,
	List_removeIf,
	List_set1,
	StringMap_get11,
	StringMap_set2,
	assert,
	string_compare2,
	string_get13,
	string_get5,
	string_slice22,
} from '../native-js.js';
import { Emitter } from './emitter.js';
import { Node, NodeKind } from './node.js';
import { Range } from './range.js';
import { Source } from './source.js';
import { strings, type } from './swizzle.js';
import { FunctionSymbol, StructSymbol, SymbolFlags_toString, VariableSymbol, _Symbol } from './symbol.js';
import { Type } from './type.js';

export class Tooltip {
	code: string;
	documentation: string;

	constructor(code: string, documentation: string) {
		this.code = code;
		this.documentation = documentation;
	}
}

export class SymbolQuery {
	source: Source;
	index: number;
	resolvedType: Type;
	symbol: _Symbol;
	range: Range;
	swizzleName: string;
	swizzleType: Type;

	generateTooltip(): Tooltip {
		if (this.swizzleName !== null) {
			return new Tooltip(`${this.swizzleType} ${this.swizzleName};`, '');
		}

		if (this.symbol !== null) {
			return new Tooltip(_tooltipForSymbol(this.symbol), _leadingCommentsToMarkdown(this.symbol.comments));
		}

		return null;
	}

	run(global: Node): void {
		this._visit(global);
	}

	_touches(range: Range): boolean {
		return range.source === this.source && range.touches(this.index);
	}

	_visitSymbol(query: _Symbol): boolean {
		if (this._touches(query.range)) {
			this.resolvedType = query.resolvedType();
			this.symbol = query;
			this.range = query.range;
			return true;
		}

		return false;
	}

	_visitVariable(variable: VariableSymbol): boolean {
		return this._visitSymbol(variable as _Symbol) || this._visit(variable.type) || this._visit(variable.arrayCount) || this._visit(variable.value());
	}

	_visitFunction(_function: FunctionSymbol): boolean {
		for (const argument of _function._arguments) {
			if (this._visitVariable(argument)) {
				return true;
			}
		}

		return this._visitSymbol(_function as _Symbol) || this._visit(_function.returnType) || this._visit(_function.block);
	}

	_visitStruct(struct: StructSymbol): boolean {
		for (const variable of struct.variables) {
			if (this._visitVariable(variable)) {
				return true;
			}
		}

		return this._visitSymbol(struct as _Symbol);
	}

	_visit(node: Node): boolean {
		let ref: Type;

		if (node === null) {
			return false;
		}

		for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
			if (this._visit(child)) {
				return true;
			}
		}

		switch (node.kind) {
			case NodeKind.NAME: {
				if (this._touches(node.range)) {
					this.resolvedType = node.resolvedType;
					this.symbol = node.symbol;
					this.range = node.range;
					return true;
				}
				break;
			}

			case NodeKind.TYPE: {
				if (this._touches(node.range)) {
					this.resolvedType = node.resolvedType;
					this.symbol = ((ref = this.resolvedType).isArrayOf !== null ? ref.isArrayOf : this.resolvedType).symbol;
					this.range = node.range;
					return true;
				}
				break;
			}

			case NodeKind.DOT: {
				if (this._touches(node.internalRange)) {
					this.resolvedType = node.resolvedType;

					if (node.dotTarget().resolvedType.isVector()) {
						this.swizzleName = node.asString();
						this.swizzleType = node.resolvedType;
					} else {
						this.symbol = node.symbol;
					}

					this.range = node.internalRange;
					return true;
				}
				break;
			}

			case NodeKind.VARIABLE: {
				return this._visitVariable(node.symbol.asVariable());
			}

			case NodeKind.FUNCTION: {
				return this._visitFunction(node.symbol.asFunction());
			}

			case NodeKind.STRUCT: {
				return this._visitStruct(node.symbol.asStruct());
			}
		}

		return false;
	}

	constructor(source: Source, index: number) {
		this.source = source;
		this.index = index;
		this.resolvedType = null;
		this.symbol = null;
		this.range = null;
		this.swizzleName = null;
		this.swizzleType = null;
	}
}

export class SymbolsQuery {
	source: Source;
	symbols: Array<_Symbol>;

	run(global: Node): void {
		this._visit(global);
	}

	_visit(node: Node): void {
		switch (node.kind) {
			case NodeKind.STRUCT:
			case NodeKind.FUNCTION: {
				this._collectSymbol(node.symbol);
				break;
			}

			case NodeKind.VARIABLES: {
				for (let child = node.variablesType().nextSibling(); child !== null; child = child.nextSibling()) {
					assert(child.kind === NodeKind.VARIABLE);
					this._collectSymbol(child.symbol);
				}
				break;
			}

			case NodeKind.GLOBAL: {
				for (let child1 = node.firstChild(); child1 !== null; child1 = child1.nextSibling()) {
					this._visit(child1);
				}
				break;
			}
		}
	}

	_collectSymbol(symbol: _Symbol): void {
		if (symbol.range !== null && symbol.range.source === this.source) {
			this.symbols.push(symbol);
		}
	}

	constructor(source: Source) {
		this.source = source;
		this.symbols = [];
	}
}

export class RenameQuery {
	source: Source;
	index: number;
	ranges: Array<Range>;
	symbol: _Symbol;

	run(global: Node): void {
		let query = new SymbolQuery(this.source, this.index);
		query.run(global);
		this.symbol = query.symbol;

		if (this.symbol !== null) {
			this._visit(global);

			// Remove overlapping ranges just in case
			let current: Range = null;
			this.ranges.sort((a: Range, b: Range) => {
				return a.source === b.source ? int_compare1(a.start, b.start) : string_compare2(a.source.name, b.source.name);
			});
			List_removeIf(this.ranges, (range: Range) => {
				let previous = current;
				current = range;
				return previous !== null && current.overlaps(previous);
			});
		}
	}

	_appendRange(range: Range, check: _Symbol): void {
		// Sanity check the range to make sure it contains the target name
		if (check === this.symbol && range !== null && range.toString() === this.symbol.name) {
			this.ranges.push(range);
		}
	}

	_visitVariable(variable: VariableSymbol): void {
		this._appendRange(variable.range, variable as _Symbol);
		this._visit(variable.type);
		this._visit(variable.arrayCount);
		this._visit(variable.value());
	}

	_visitFunction(_function: FunctionSymbol): void {
		this._appendRange(_function.range, _function as _Symbol);
		this._appendRange(_function.range, _function.sibling as _Symbol);
		this._visit(_function.returnType);
		this._visit(_function.block);

		for (const argument of _function._arguments) {
			this._visitVariable(argument);
		}
	}

	_visitStruct(struct: StructSymbol): void {
		this._appendRange(struct.range, struct as _Symbol);

		for (const variable of struct.variables) {
			this._visitVariable(variable);
		}
	}

	_visit(node: Node): void {
		if (node !== null) {
			for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
				this._visit(child);
			}

			switch (node.kind) {
				case NodeKind.NAME: {
					this._appendRange(node.range, node.symbol);
					break;
				}

				case NodeKind.DOT: {
					this._appendRange(node.internalRange, node.symbol);
					break;
				}

				case NodeKind.TYPE: {
					this._appendRange(node.range, node.resolvedType.symbol);
					break;
				}

				case NodeKind.VARIABLE: {
					this._visitVariable(node.symbol.asVariable());
					break;
				}

				case NodeKind.FUNCTION: {
					this._visitFunction(node.symbol.asFunction());
					break;
				}

				case NodeKind.STRUCT: {
					this._visitStruct(node.symbol.asStruct());
					break;
				}
			}
		}
	}

	constructor(source: Source, index: number) {
		this.source = source;
		this.index = index;
		this.ranges = [];
		this.symbol = null;
	}
}

export class Completion {
	kind: string;
	name: string;
	detail: string;
	documentation: string;

	constructor(kind: string, name: string) {
		this.kind = kind;
		this.name = name;
		this.detail = '';
		this.documentation = '';
	}
}

export class CompletionQuery {
	source: Source;
	index: number;
	_map: Map<string, Completion>;
	completions: Array<Completion>;

	run(global: Node): void {
		this._addTextualCompletion('keyword', 'false');
		this._addTextualCompletion('keyword', 'true');
		this._addTextualCompletion('keyword', 'void');

		for (const type of Type.BUILT_INS) {
			this._addTextualCompletion('struct', type.symbol.name).detail = _tooltipForSymbol(type.symbol);
		}

		this._visit(global, true);
	}

	_touches(range: Range): boolean {
		return range !== null && range.source === this.source && range.touches(this.index);
	}

	_addTextualCompletion(kind: string, name: string): Completion {
		let completion: Completion = null;

		if (this._map.has(name)) {
			completion = StringMap_get11(this._map, name);
		} else {
			completion = new Completion(kind, name);
			this.completions.push(completion);
			StringMap_set2(this._map, name, completion);
		}

		return completion;
	}

	_addSymbolCompletion(symbol: _Symbol): void {
		let kind = symbol.isFunction() ? 'function' : symbol.isStruct() ? 'struct' : 'variable';
		let completion = this._addTextualCompletion(kind, symbol.name);

		if (completion.detail !== '') {
			completion.detail += '\n';
		} else {
			completion.documentation = _leadingCommentsToMarkdown(symbol.comments);
		}

		completion.detail += _tooltipForSymbol(symbol);
	}

	_visit(node: Node, isGlobal: boolean): boolean {
		if (node === null) {
			return false;
		}

		let touches = this._touches(node.range);

		switch (node.kind) {
			case NodeKind.FUNCTION: {
				this._addSymbolCompletion(node.symbol);

				if (touches) {
					let _function = node.symbol.asFunction();
					this._addTextualCompletion('keyword', 'discard');
					this._addTextualCompletion('keyword', 'return');

					for (const arg of _function._arguments) {
						this._addSymbolCompletion(arg as _Symbol);
					}

					this._visit(_function.block, false);
				}
				break;
			}

			case NodeKind.VARIABLE: {
				this._addSymbolCompletion(node.symbol);
				break;
			}

			case NodeKind.STRUCT: {
				this._addSymbolCompletion(node.symbol);
				break;
			}

			case NodeKind.FOR:
			case NodeKind.WHILE:
			case NodeKind.DO_WHILE: {
				if (touches) {
					this._addTextualCompletion('keyword', 'break');
					this._addTextualCompletion('keyword', 'continue');
				}
				break;
			}

			case NodeKind.DOT: {
				let dotTarget = node.dotTarget();

				if (touches && !this._touches(dotTarget.range)) {
					this.completions = [];
					let type = dotTarget.resolvedType;
					let value = type;

					if (
						value === Type.BVEC2 ||
						value === Type.IVEC2 ||
						value === Type.VEC2 ||
						value === Type.BVEC3 ||
						value === Type.IVEC3 ||
						value === Type.VEC3 ||
						value === Type.BVEC4 ||
						value === Type.IVEC4 ||
						value === Type.VEC4
					) {
						for (const set of strings(type.componentCount())) {
							for (let count = 1; count <= 4; count = count + 1) {
								let counters: Array<number> = [];

								for (let i = 0; i < count; i = i + 1) {
									counters.push(0);
								}

								// Generate all valid permutations
								while (true) {
									let name = '';

									for (let i1 = 0; i1 < count; i1 = i1 + 1) {
										name += string_get5(set, List_get2(counters, i1));
									}

									let symbol = type(type.componentType(), name.length).symbol;
									this._addTextualCompletion('variable', name).detail = `${symbol.name} ${name};`;

									// Increment and carry
									let i2 = 0;

									while (i2 < count) {
										let counter = List_get2(counters, i2);

										if ((counter = counter + 1) === set.length) {
											counter = 0;
										}

										List_set1(counters, i2, counter);

										if (counter !== 0) {
											break;
										}

										i2 = i2 + 1;
									}

									if (i2 === count) {
										break;
									}
								}
							}
						}
					} else if (type.symbol !== null && type.symbol.isStruct()) {
						for (const variable of type.symbol.asStruct().variables) {
							this._addSymbolCompletion(variable as _Symbol);
						}
					}

					return true;
				}
				break;
			}
		}

		if (isGlobal || touches || node.kind === NodeKind.VARIABLES) {
			for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
				if (this._visit(child, false)) {
					return true;
				}
			}
		}

		return touches;
	}

	constructor(source: Source, index: number) {
		this.source = source;
		this.index = index;
		this._map = new Map();
		this.completions = [];
	}
}

export class Signature {
	text: string;
	_arguments: Array<string>;
	documentation: string;

	constructor(text: string, _arguments: Array<string>, documentation: string) {
		this.text = text;
		this._arguments = _arguments;
		this.documentation = documentation;
	}
}

export class SignatureQuery {
	source: Source;
	index: number;
	signatures: Array<Signature>;
	activeArgument: number;
	activeSignature: number;

	run(global: Node): void {
		this._visit(global);
	}

	_touches(range: Range): boolean {
		return range !== null && range.source === this.source && range.touches(this.index);
	}

	_visit(node: Node): boolean {
		if (node === null) {
			return false;
		}

		if (node.kind !== NodeKind.GLOBAL && !this._touches(node.range)) {
			return false;
		}

		for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
			if (this._visit(child)) {
				return true;
			}
		}

		switch (node.kind) {
			case NodeKind.FUNCTION: {
				this._visit(node.symbol.asFunction().block);
				return true;
			}

			case NodeKind.CALL: {
				let callTarget = node.callTarget();

				if (!this._touches(callTarget.range)) {
					let firstArgument = callTarget.nextSibling();
					let type = callTarget.resolvedType;
					let symbol = type.symbol;
					let _arguments: Array<Node> = [];

					for (let arg = firstArgument; arg !== null; arg = arg.nextSibling()) {
						_arguments.push(arg);
					}

					if (symbol.isFunction()) {
						let overloads: Array<FunctionSymbol> = [];

						// Collect all relevant overloads but ignore forward-declared functions that also have an implementation
						for (let overload = symbol.asFunction(); overload !== null; overload = overload.previousOverload) {
							if (!(overloads.indexOf(overload.sibling) !== -1)) {
								overloads.push(overload);
							}
						}

						// Show overloads in source order
						overloads.reverse();

						for (const overload1 of overloads) {
							this.signatures.push(
								new Signature(
									_tooltipForSymbol(overload1 as _Symbol),
									overload1._arguments.map<string>((arg: VariableSymbol) => {
										return _variableTooltipText(arg);
									}),
									_leadingCommentsToMarkdown(overload1.comments)
								)
							);
						}

						// Pick an active overload
						if (!(this.signatures.length === 0)) {
							this.activeSignature = 0;

							// Start off with all overloads
							let filteredOverloads: Array<number> = [];

							for (let i = 0; i < overloads.length; i = i + 1) {
								filteredOverloads.push(i);
							}

							// Try filtering by argument count
							for (let limit = _arguments.length; limit > 0; limit = limit - 1) {
								let nextFilteredOverloads: Array<number> = [];

								for (const index of filteredOverloads) {
									if (List_get2(overloads, index)._arguments.length >= limit) {
										nextFilteredOverloads.push(index);
									}
								}

								if (!(nextFilteredOverloads.length === 0)) {
									filteredOverloads = nextFilteredOverloads;
									break;
								}
							}

							// Narrow down by argument types
							if (filteredOverloads.length > 1) {
								let nextFilteredOverloads1 = filteredOverloads.slice();
								List_removeIf(nextFilteredOverloads1, (overloadIndex: number) => {
									let fromArguments = List_get2(overloads, overloadIndex)._arguments;

									for (let i = 0, count = Math.min(fromArguments.length, _arguments.length); i < count; i = i + 1) {
										let from = List_get2(fromArguments, i).type.resolvedType;
										let to = List_get2(_arguments, i).resolvedType;

										if (to !== Type.ERROR && from !== to) {
											return true;
										}
									}

									return false;
								});

								// Narrow down by argument types with "conversions" to get better error messages
								if (nextFilteredOverloads1.length === 0) {
									nextFilteredOverloads1 = filteredOverloads.slice();
									List_removeIf(nextFilteredOverloads1, (overloadIndex: number) => {
										let fromArguments = List_get2(overloads, overloadIndex)._arguments;

										for (let i = 0, count = Math.min(fromArguments.length, _arguments.length); i < count; i = i + 1) {
											let from = List_get2(fromArguments, i).type.resolvedType;
											let to = List_get2(_arguments, i).resolvedType;
											let fromSize = from.componentCount();
											let toSize = to.componentCount();

											if (to !== Type.ERROR && from !== to && (fromSize === 0 || toSize === 0 || fromSize !== toSize)) {
												return true;
											}
										}

										return false;
									});
								}

								if (!(nextFilteredOverloads1.length === 0)) {
									filteredOverloads = nextFilteredOverloads1;
								}
							}

							if (!(filteredOverloads.length === 0)) {
								this.activeSignature = List_get2(filteredOverloads, 0);
							}
						}
					}

					if (symbol.isStruct() && type.componentType() === null) {
						// Generate the constructor call signature
						let fields = symbol.asStruct().variables.map<string>((arg: VariableSymbol) => {
							return _variableTooltipText(arg);
						});
						this.signatures.push(new Signature(`${symbol.name}(${fields.join(', ')});`, fields, _leadingCommentsToMarkdown(symbol.comments)));
						this.activeSignature = 0;
					}

					// Compute the active argument index
					if (!(_arguments.length === 0)) {
						this.activeArgument = 0;

						for (const arg1 of _arguments) {
							if (this.index <= arg1.range.end || arg1.nextSibling() === null) {
								break;
							}

							this.activeArgument = this.activeArgument + 1;
						}
					}

					return true;
				}
				break;
			}
		}

		return false;
	}

	constructor(source: Source, index: number) {
		this.source = source;
		this.index = index;
		this.signatures = [];
		this.activeArgument = -1;
		this.activeSignature = -1;
	}
}

export function constantValueToString(node: Node): string {
	switch (node.kind) {
		case NodeKind.INT: {
			return node.asInt().toString();
		}

		case NodeKind.BOOL: {
			return node.asBool().toString();
		}

		case NodeKind.FLOAT: {
			return Emitter.floatToString(node.asFloat(), Emitter.EmitMode.NORMAL);
		}

		case NodeKind.CALL: {
			assert(node.callTarget().kind === NodeKind.TYPE);
			assert(node.callTarget().resolvedType === node.resolvedType);
			let callTarget = node.callTarget();
			let text = `${node.resolvedType}(`;

			for (let child = callTarget.nextSibling(); child !== null; child = child.nextSibling()) {
				if (child.previousSibling() !== callTarget) {
					text += ', ';
				}

				text += constantValueToString(child);
			}

			return text + ')';
		}
	}

	return null;
}

export function _tooltipForSymbol(symbol: _Symbol): string {
	if (symbol.isStruct()) {
		let struct = symbol.asStruct();
		let text = `${SymbolFlags_toString(struct.flags)}struct ${symbol.name}`;

		if (!struct.isNative()) {
			text += ' {\n';

			for (const variable of struct.variables) {
				text += `  ${_variableTooltipText(variable)};\n`;
			}

			text += '}';
		}

		return text + ';';
	}

	if (symbol.isVariable()) {
		let variable1 = symbol.asVariable();
		let text1 = _variableTooltipText(variable1);

		if (variable1.constantValue !== null) {
			let constantValue = constantValueToString(variable1.constantValue);

			if (constantValue !== null) {
				text1 += ' = ' + constantValue;
			}
		}

		return text1 + ';';
	}

	if (symbol.isFunction()) {
		let _function = symbol.asFunction();
		let text2 = `${SymbolFlags_toString(_function.flags)}${_function.returnType.resolvedType} ${symbol.name}(`;

		for (const argument of _function._arguments) {
			if (argument !== List_first(_function._arguments)) {
				text2 += ', ';
			}

			text2 += _variableTooltipText(argument);
		}

		return text2 + ');';
	}

	assert(false);
	return null;
}

export function _variableTooltipText(variable: VariableSymbol): string {
	let type = variable.type.resolvedType;
	let text = `${SymbolFlags_toString(variable.flags)}${type.isArrayOf !== null ? type.isArrayOf : type} ${variable.name}`;

	if (type.isArrayOf !== null) {
		text += type.arrayCount !== 0 ? `[${type.arrayCount}]` : '[]';
	}

	return text;
}

export function _leadingCommentsToMarkdown(comments: Array<string>): string {
	let markdown = '';

	if (comments !== null) {
		for (const comment of comments) {
			let start = 0;
			let end = comment.length;

			// Remove the comment marker
			if (comment.startsWith('//')) {
				start = start + 2;
			} else if (comment.startsWith('/*')) {
				start = start + 2;
				end = end - 2;
			}

			// Trim leading and trailing whitespace
			while (start < end && string_get13(comment, start) === 32) {
				start = start + 1;
			}

			while (end > start && string_get13(comment, end - 1) === 32) {
				end = end - 1;
			}

			// Append the comment content
			if (markdown !== '') {
				markdown += '\n';
			}

			markdown += string_slice22(comment, start, end);
		}
	}

	return markdown;
}
