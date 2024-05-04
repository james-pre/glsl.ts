import { Range } from './range.js';
import { BaseSymbol } from './symbol.js';
import { Token, TokenKind } from './tokenizer.js';
import { Type } from './type.js';

export enum DiagnosticKind {
	ERROR,
	WARNING,
}

export class Diagnostic {
	kind: DiagnosticKind;
	range: Range;
	text: string;
	noteRange: Range;
	noteText: string;

	static format(kind: string, range: Range, text: string): string {
		if (range === null) {
			return `${kind}: ${text}\n`;
		}

		const formatted = range.format(0);
		return `${range.locationString()}: ${kind}: ${text}\n${formatted.line}\n${formatted.range}\n`;
	}

	constructor(kind: DiagnosticKind, range: Range, text: string) {
		this.kind = kind;
		this.range = range;
		this.text = text;
		this.noteRange = null;
		this.noteText = '';
	}
}

export class Log {
	diagnostics: Diagnostic[];
	unusedSymbols: BaseSymbol[];
	warningCount: number;
	errorCount: number;
	_prevErrorRange: Range;

	toString(): string {
		let builder = '';

		// Emit the log assuming an infinite terminal width
		for (const diagnostic of this.diagnostics) {
			builder += Diagnostic.format(diagnostic.kind === DiagnosticKind.ERROR ? 'error' : 'warning', diagnostic.range, diagnostic.text);

			// Append notes after the diagnostic they apply to
			if (diagnostic.noteRange !== null) {
				builder += Diagnostic.format('note', diagnostic.noteRange, diagnostic.noteText);
			}
		}

		return builder;
	}

	hasErrors(): boolean {
		return this.errorCount !== 0;
	}

	hasWarnings(): boolean {
		return this.warningCount !== 0;
	}

	error(range: Range, text: string): void {
		if (this._prevErrorRange !== null && this._prevErrorRange.start === range.start) {
			return; // Don't double-report errors in the same spot
		}

		this._prevErrorRange = range;
		this.diagnostics.push(new Diagnostic(DiagnosticKind.ERROR, range, text));
		this.errorCount = this.errorCount + 1;
	}

	warning(range: Range, text: string): void {
		this.diagnostics.push(new Diagnostic(DiagnosticKind.WARNING, range, text));
		this.warningCount = this.warningCount + 1;
	}

	note(range: Range, text: string): void {
		const last = this.diagnostics.at(-1);
		last.noteRange = range;
		last.noteText = text;
	}

	syntaxWarningUnknownExtension(range: Range, name: string): void {
		this.warning(range, `The extension "${name}" is not in the known list of valid WebGL extensions`);
	}

	syntaxErrorInvalidString(range: Range): void {
		this.error(range, 'Invalid string literal');
	}

	syntaxErrorDisabledExtension(range: Range, name: string, extension: string): void {
		this.error(range, `Cannot use "${name}" from disabled extension "${extension}"`);
	}

	syntaxErrorExtraData(range: Range, text: string): void {
		this.error(range, `Syntax error "${text}"`);
	}

	syntaxErrorReservedWord(range: Range): void {
		this.error(range, `"${range}" is a reserved word`);
	}

	syntaxErrorUnexpectedToken(token: Token): void {
		this.error(token.range, `Unexpected ${TokenKind[token.kind]}`);
	}

	syntaxErrorExpectedToken1(range: Range, expected: TokenKind): void {
		this.error(range, `Expected ${TokenKind[expected]}`);
	}

	syntaxErrorExpectedToken2(range: Range, found: TokenKind, expected: TokenKind): void {
		this.error(range, `Expected ${TokenKind[expected]} but found ${TokenKind[found]}`);
	}

	syntaxErrorBadSymbolReference(range: Range): void {
		this.error(range, `There is no symbol called "${range}" in the current scope`);
	}

	syntaxErrorDuplicateSymbolDefinition(range: Range, previous: Range): void {
		this.error(range, `There is already a symbol called "${range}" in the current scope`);
		this.note(previous, `The previous definition of "${previous}" is here`);
	}

	syntaxErrorOutsideLoop(range: Range): void {
		this.error(range, 'This statement cannot be used outside a loop');
	}

	syntaxErrorStructVariableInitializer(range: Range): void {
		this.error(range, 'Cannot initialize struct variables');
	}

	syntaxErrorInsideStruct(range: Range): void {
		this.error(range, 'This statement cannot be used inside a struct');
	}

	syntaxErrorInsideFunction(range: Range): void {
		this.error(range, 'This statement cannot be used inside a function');
	}

	syntaxErrorOutsideFunction(range: Range): void {
		this.error(range, 'This statement cannot be used outside a function');
	}

	syntaxErrorIncludeOutsideGlobal(range: Range): void {
		this.error(range, '"#include" statements cannot be used here');
	}

	semanticErrorIncludeWithoutFileAccess(range: Range): void {
		this.error(range, 'Cannot include files without access to a file system');
	}

	semanticErrorIncludeBadPath(range: Range, path: string): void {
		this.error(range, `Cannot read the file ${JSON.stringify(path)}`);
	}

	syntaxErrorDifferentReturnType(range: Range, name: string, type: Type, expected: Type, previous: Range): void {
		this.error(range, `Cannot change the return type of "${name}" to type "${type}"`);
		this.note(previous, `The forward declaration of "${name}" has a return type of "${expected}"`);
	}

	syntaxErrorBadQualifier(range: Range): void {
		this.error(range, 'Cannot use this qualifier here');
	}

	syntaxErrorConstantRequired(range: Range): void {
		this.error(range, 'This value must be a compile-time constant');
	}

	syntaxErrorInvalidArraySize(range: Range, count: number): void {
		this.error(range, `Cannot declare an array with a size of "${count}"`);
	}

	syntaxErrorMissingArraySize(range: Range): void {
		this.error(range, 'All array sizes must be specified');
	}

	syntaxErrorMultidimensionalArray(range: Range): void {
		this.error(range, 'Multidimensional arrays are not a part of the language');
	}

	syntaxErrorInvalidOperator(range: Range): void {
		this.error(range, `The operator "${range}" is reserved and cannot be used`);
	}

	semanticErrorBadConversion(range: Range, from: Type, to: Type): void {
		this.error(range, `Cannot convert from type "${from}" to type "${to}"`);
	}

	semanticErrorUnexpectedType(range: Range, type: Type): void {
		this.error(range, `Unexpected type "${type}"`);
	}

	semanticErrorBadVariableType(range: Range, type: Type): void {
		this.error(range, `Cannot create a variable of type "${type}"`);
	}

	semanticErrorBadMember(range: Range, type: Type, name: string): void {
		this.error(range, `Cannot find "${name}" on type "${type}"`);
	}

	semanticErrorBadSwizzle(range: Range, type: Type, name: string): void {
		this.error(range, `Invalid swizzle "${name}" on type "${type}"`);
	}

	semanticErrorBadSwizzleAssignment(range: Range, field: string): void {
		this.error(range, `The field "${field}" cannot be specified multiple times when used as a storage location`);
	}

	semanticErrorMustCallFunction(range: Range, name: string): void {
		this.error(range, `The function "${name}" must be called`);
	}

	semanticErrorBadCall(range: Range, type: Type): void {
		this.error(range, `Cannot call type "${type}"`);
	}

	semanticErrorBadConstructorValue(range: Range, type: Type, constructor: Type): void {
		this.error(range, `Cannot use value of type "${type}" when constructing type "${constructor}"`);
	}

	semanticErrorExtraConstructorValue(range: Range, type: Type, count: number, total: number): void {
		this.error(range, `The constructor for type "${type}" only takes ${count} argument${Log.plural(count)} and this argument would bring the total to ${total}`);
	}

	semanticErrorBadConstructorCount(range: Range, type: Type, count: number): void {
		this.error(range, `Cannot construct type "${type}" with ${count} argument${Log.plural(count)}`);
	}

	semanticErrorArgumentCountFunction(range: Range, expected: number, found: number, name: string, _function: Range): void {
		this.error(range, `Expected ${expected} argument${Log.plural(expected)} but found ${found} argument${Log.plural(found)} when calling function "${name}"`);

		if (_function !== null) {
			this.note(_function, `The definition of function "${name}" is here`);
		}
	}

	semanticErrorArgumentCountConstructor(range: Range, expected: number, found: number, name: string, struct: Range): void {
		this.error(range, `Expected ${expected} argument${Log.plural(expected)} but found ${found} argument${Log.plural(found)} when constructing type "${name}"`);

		if (struct !== null) {
			this.note(struct, `The definition of struct "${name}" is here`);
		}
	}

	semanticErrorBadOverloadMatch(range: Range, name: string): void {
		this.error(range, `No matching overload for function "${name}"`);
	}

	semanticErrorBadHookTypes(range: Range, left: Type, right: Type): void {
		this.error(range, `Cannot merge type "${left}" and type "${right}"`);
	}

	semanticErrorArrayHook(range: Range, type: Type): void {
		if (type.isArrayOf !== null) {
			this.error(range, `Cannot use a conditional expression with array type "${type}"`);
		} else {
			this.error(range, `Cannot use a conditional expression with type "${type}" because it contains an array`);
		}
	}

	semanticErrorArrayAssignment(range: Range, type: Type): void {
		if (type.isArrayOf !== null) {
			this.error(range, `Cannot assign to array type "${type}"`);
		} else {
			this.error(range, `Cannot assign to type "${type}" because it contains an array`);
		}
	}

	semanticErrorBadUnaryOperator(range: Range, operator: string, type: Type): void {
		this.error(range, `No unary operator "${operator}" for type "${type}"`);
	}

	semanticErrorBadBinaryOperator(range: Range, operator: string, left: Type, right: Type): void {
		if (left === right) {
			this.error(range, `There is no operator "${operator}" defined for type "${left}"`);
		} else {
			this.error(range, `No binary operator "${operator}" for type "${left}" and type "${right}"`);
		}
	}

	semanticErrorBadIndex(range: Range, left: Type, right: Type): void {
		this.error(range, `No index operator for type "${left}" and type "${right}"`);
	}

	semanticErrorOutOfBoundsIndex(range: Range, value: number, type: Type): void {
		this.error(range, `Index "${value}" is out of bounds for type "${type}"`);
	}

	semanticErrorBadStorage(range: Range): void {
		this.error(range, 'Cannot store to this location');
	}

	semanticErrorUninitializedConstant(range: Range): void {
		this.error(range, 'Constants must be initialized');
	}

	semanticErrorMissingReturn(range: Range, name: string, type: Type): void {
		this.error(range, `All control paths for "${name}" must return a value of type "${type}"`);
	}

	semanticErrorBadMatrixConstructor(range: Range): void {
		this.error(range, 'If a matrix argument is given to a matrix constructor, it is an error to have any other arguments');
	}

	static plural(value: number): string {
		return value !== 1 ? 's' : '';
	}

	constructor() {
		this.diagnostics = [];
		this.unusedSymbols = [];
		this.warningCount = 0;
		this.errorCount = 0;
		this._prevErrorRange = null;
	}
}
