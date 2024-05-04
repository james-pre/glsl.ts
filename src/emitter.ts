import { CompilerOptions } from './compiler.js';
import { Node, NodeKind, NodeKind_isBinaryAssign, NodeKind_isExpression, NodeKind_isStatement, NodeKind_isUnaryPrefix } from './node.js';
import { Precedence } from './pratt.js';
import { SymbolFlags, SymbolFlags_toString, VariableSymbol } from './symbol.js';

export class Emitter {
	protected _code: string = '';
	protected _indent: string = '';
	protected _newline: string = '\n';
	protected _space: string = ' ';
	protected _removeWhitespace: boolean = false;

	public constructor(node: Node, options: CompilerOptions) {
		this._removeWhitespace = !options.keepWhitespace;

		if (this._removeWhitespace) {
			this._space = '';
			this._newline = '';
		}

		let previous: Node;

		for (let child = node.firstChild(); child; child = child.nextSibling()) {
			if (this._isImportedNode(child)) {
				continue;
			}

			if (previous && Emitter._shouldSeparateWithExtraNewline(previous, child)) {
				this._code += this._newline;
			}

			this._emitNode(child);
			this._code += this._newline;
			previous = child;
		}
	}

	protected _isImportedNode(node: Node): boolean {
		switch (node.kind) {
			case NodeKind.FUNCTION:
			case NodeKind.STRUCT: {
				return (SymbolFlags.IMPORTED & node.symbol.flags) !== 0;
			}

			case NodeKind.VARIABLES: {
				return (SymbolFlags.IMPORTED & node.variablesFlags()) !== 0;
			}

			default: {
				return false;
			}
		}
	}

	protected _increaseIndent(): void {
		if (!this._removeWhitespace) {
			this._indent += '\t';
		}
	}

	protected _decreaseIndent(): void {
		if (!this._removeWhitespace) {
			this._indent = this._indent.slice(1);
		}
	}

	protected _emitNode(node: Node): void {
		console.assert(NodeKind_isStatement(node.kind));

		switch (node.kind) {
			case NodeKind.BLOCK: {
				if (!node.hasChildren() && node.parent()) {
					this._code += ';';
				} else {
					this._code += '{' + this._newline;
					this._increaseIndent();

					for (let child = node.firstChild(); child; child = child.nextSibling()) {
						this._code += this._indent;
						this._emitNode(child);
						this._code += this._newline;
					}

					this._decreaseIndent();
					this._code += this._indent + '}';
				}
				break;
			}

			case NodeKind.BREAK: {
				this._code += 'break;';
				break;
			}

			case NodeKind.CONTINUE: {
				this._code += 'continue;';
				break;
			}

			case NodeKind.DISCARD: {
				this._code += 'discard;';
				break;
			}

			case NodeKind.DO_WHILE: {
				this._code += 'do';
				this._emitBody(node.doWhileBody(), Emitter.After.AFTER_KEYWORD);
				this._code += this._newline + this._indent + 'while' + this._space + '(';
				this._emitNodePrecedence(node.doWhileTest(), Precedence.LOWEST);
				this._code += ');';
				break;
			}

			case NodeKind.EXPRESSION: {
				this._emitNodePrecedence(node.expressionValue(), Precedence.LOWEST);
				this._code += ';';
				break;
			}

			case NodeKind.EXTENSION: {
				this._emitNewlineBeforePragma();
				this._code += '#extension ' + node.extensionName() + this._space + ':' + this._space + node.extensionBehavior();
				this._emitNewlineAfterPragma();
				break;
			}

			case NodeKind.FOR: {
				this._code += 'for' + this._space + '(';

				if (node.forSetup()) {
					if (node.forSetup().kind === NodeKind.VARIABLES) {
						this._emitNode(node.forSetup());
					} else {
						this._emitNodePrecedence(node.forSetup(), Precedence.LOWEST);
						this._code += ';';
					}
				} else {
					this._code += ';';
				}

				if (node.forTest()) {
					this._code += this._space;
					this._emitNodePrecedence(node.forTest(), Precedence.LOWEST);
				}

				this._code += ';';

				if (node.forUpdate()) {
					this._code += this._space;
					this._emitNodePrecedence(node.forUpdate(), Precedence.LOWEST);
				}

				this._code += ')';
				this._emitBody(node.forBody(), Emitter.After.AFTER_PARENTHESIS);
				break;
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();
				this._code += SymbolFlags_toString(_function.flags);
				this._emitNodePrecedence(_function.returnType, Precedence.LOWEST);
				this._code += ' ';
				this._code += _function.name;
				this._code += '(';

				for (const argument of _function._arguments) {
					if (argument !== _function._arguments[0]) {
						this._code += ',' + this._space;
					}

					this._code += SymbolFlags_toString(argument.flags);
					this._emitNodePrecedence(argument.type, Precedence.LOWEST);
					this._code += ' ';
					this._emitVar(argument);
				}

				this._code += ')';

				if (_function.block) {
					this._code += this._space;
					this._emitNode(_function.block);
				} else {
					this._code += ';';
				}
				break;
			}

			case NodeKind.IF: {
				this._code += 'if' + this._space + '(';
				this._emitNodePrecedence(node.ifTest(), Precedence.LOWEST);
				this._code += ')';
				this._emitBody(node.ifTrue(), Emitter.After.AFTER_PARENTHESIS);

				if (node.ifFalse()) {
					this._code += this._newline + this._indent + 'else';

					if (node.ifFalse().kind === NodeKind.IF) {
						this._code += ' ';
						this._emitNode(node.ifFalse());
					} else {
						this._emitBody(node.ifFalse(), Emitter.After.AFTER_KEYWORD);
					}
				}
				break;
			}

			case NodeKind.PRECISION: {
				this._code += 'precision ';
				this._code += SymbolFlags_toString(node.precisionFlag());
				this._emitNodePrecedence(node.precisionType(), Precedence.LOWEST);
				this._code += ';';
				break;
			}

			case NodeKind.RETURN: {
				const value = node.returnValue();
				this._code += 'return';

				if (value) {
					if (!NodeKind_isUnaryPrefix(value.kind)) {
						this._code += ' ';
					}

					this._emitNodePrecedence(value, Precedence.LOWEST);
				}

				this._code += ';';
				break;
			}

			case NodeKind.STRUCT: {
				const symbol = node.symbol.asStruct();
				this._code += SymbolFlags_toString(symbol.flags);
				this._code += 'struct ' + symbol.name + this._space + '{' + this._newline;
				this._increaseIndent();

				for (let child1 = node.structBlock().firstChild(); child1; child1 = child1.nextSibling()) {
					console.assert(child1.kind === NodeKind.VARIABLES);
					this._code += this._indent;
					this._emitNode(child1);
					this._code += this._newline;
				}

				this._decreaseIndent();
				this._code += this._indent + '}';

				if (node.structVariables()) {
					for (let child2 = node.structVariables().variablesType().nextSibling(); child2; child2 = child2.nextSibling()) {
						console.assert(child2.kind === NodeKind.VARIABLE);
						this._code += !child2.previousSibling().previousSibling() ? this._space : ',' + this._space;
						this._emitVar(child2.symbol.asVariable());
					}
				}

				this._code += ';';
				break;
			}

			case NodeKind.VARIABLES: {
				this._code += SymbolFlags_toString(node.variablesFlags());
				this._emitNodePrecedence(node.variablesType(), Precedence.LOWEST);

				for (let child3 = node.variablesType().nextSibling(); child3; child3 = child3.nextSibling()) {
					const variable = child3.symbol.asVariable();
					this._code += !child3.previousSibling().previousSibling() ? ' ' : ',' + this._space;
					this._emitVar(variable);
				}

				this._code += ';';
				break;
			}

			case NodeKind.VERSION: {
				this._emitNewlineBeforePragma();
				this._code += '#version ' + node.versionNumber().toString();
				this._emitNewlineAfterPragma();
				break;
			}

			case NodeKind.WHILE: {
				this._code += 'while' + this._space + '(';
				this._emitNodePrecedence(node.whileTest(), Precedence.LOWEST);
				this._code += ')';
				this._emitBody(node.whileBody(), Emitter.After.AFTER_PARENTHESIS);
				break;
			}

			default: {
				this._code += NodeKind[node.kind];
				break;
			}
		}
	}

	protected _emitNewlineBeforePragma(): void {
		if (this._code !== '' && !this._code.endsWith('\n')) {
			this._code += '\n';
		}
	}

	protected _emitNewlineAfterPragma(): void {
		if (this._removeWhitespace) {
			this._code += '\n';
		}
	}

	protected _emitBody(node: Node, after: Emitter.After): void {
		if (node.kind === NodeKind.BLOCK) {
			this._code += this._space;
			this._emitNode(node);
		} else {
			this._code += this._removeWhitespace && after === Emitter.After.AFTER_KEYWORD ? ' ' : this._newline;
			this._increaseIndent();
			this._code += this._indent;
			this._emitNode(node);
			this._decreaseIndent();
		}
	}

	protected _emitCommaSeparatedExpressions(node: Node): void {
		for (let child = node; child; child = child.nextSibling()) {
			if (child !== node) {
				this._code += ',' + this._space;
			}

			this._emitNodePrecedence(child, Precedence.COMMA);
		}
	}

	protected _emitVar(variable: VariableSymbol): void {
		this._code += variable.name;

		if (variable.arrayCount) {
			this._code += '[';
			this._emitNodePrecedence(variable.arrayCount, Precedence.LOWEST);
			this._code += ']';
		}

		if (variable.value()) {
			this._code += this._space + '=' + this._space;
			this._emitNodePrecedence(variable.value(), Precedence.COMMA);
		}
	}

	protected _emitNodePrecedence(node: Node, precedence: Precedence): void {
		console.assert(NodeKind_isExpression(node.kind));

		switch (node.kind) {
			case NodeKind.CALL: {
				this._emitNodePrecedence(node.callTarget(), Precedence.UNARY_POSTFIX);
				this._code += '(';
				this._emitCommaSeparatedExpressions(node.callTarget().nextSibling());
				this._code += ')';
				break;
			}

			case NodeKind.DOT: {
				this._emitNodePrecedence(node.dotTarget(), Precedence.MEMBER);
				this._code += '.';
				this._code += node.symbol ? node.symbol.name : node.asString();
				break;
			}

			case NodeKind.HOOK: {
				if (Precedence.ASSIGN < precedence) {
					this._code += '(';
				}

				this._emitNodePrecedence(node.hookTest(), Precedence.LOGICAL_OR);
				this._code += this._space + '?' + this._space;
				this._emitNodePrecedence(node.hookTrue(), Precedence.ASSIGN);
				this._code += this._space + ':' + this._space;
				this._emitNodePrecedence(node.hookFalse(), Precedence.ASSIGN);

				if (Precedence.ASSIGN < precedence) {
					this._code += ')';
				}
				break;
			}

			case NodeKind.NAME: {
				this._code += node.symbol.name;
				break;
			}

			case NodeKind.SEQUENCE: {
				if (Precedence.COMMA <= precedence) {
					this._code += '(';
				}

				this._emitCommaSeparatedExpressions(node.firstChild());

				if (Precedence.COMMA <= precedence) {
					this._code += ')';
				}
				break;
			}

			case NodeKind.TYPE: {
				this._code += node.resolvedType.rootType().symbol.name;
				break;
			}

			case NodeKind.BOOL: {
				this._code += node.asBool().toString();
				break;
			}

			case NodeKind.FLOAT: {
				this._code += Emitter.floatToString(node.asFloat(), this._removeWhitespace ? Emitter.EmitMode.MINIFIED : Emitter.EmitMode.NORMAL);
				break;
			}

			case NodeKind.INT: {
				this._code += node.asInt().toString();
				break;
			}

			case NodeKind.INDEX: {
				this._emitNodePrecedence(node.binaryLeft(), Precedence.MEMBER);
				this._code += '[';
				this._emitNodePrecedence(node.binaryRight(), Precedence.LOWEST);
				this._code += ']';
				break;
			}

			case NodeKind.NEGATIVE: {
				this._emitUnaryPrefix('-', node, precedence);
				break;
			}

			case NodeKind.NOT: {
				this._emitUnaryPrefix('!', node, precedence);
				break;
			}

			case NodeKind.POSITIVE: {
				this._emitUnaryPrefix('+', node, precedence);
				break;
			}

			case NodeKind.PREFIX_DECREMENT: {
				this._emitUnaryPrefix('--', node, precedence);
				break;
			}

			case NodeKind.PREFIX_INCREMENT: {
				this._emitUnaryPrefix('++', node, precedence);
				break;
			}

			case NodeKind.POSTFIX_DECREMENT: {
				this._emitUnaryPostfix('--', node, precedence);
				break;
			}

			case NodeKind.POSTFIX_INCREMENT: {
				this._emitUnaryPostfix('++', node, precedence);
				break;
			}

			case NodeKind.ADD: {
				this._emitBinary('+', node, precedence, Precedence.ADD);
				break;
			}

			case NodeKind.DIVIDE: {
				this._emitBinary('/', node, precedence, Precedence.MULTIPLY);
				break;
			}

			case NodeKind.EQUAL: {
				this._emitBinary('==', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.GREATER_THAN: {
				this._emitBinary('>', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.GREATER_THAN_OR_EQUAL: {
				this._emitBinary('>=', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.LESS_THAN: {
				this._emitBinary('<', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.LESS_THAN_OR_EQUAL: {
				this._emitBinary('<=', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.LOGICAL_AND: {
				this._emitBinary('&&', node, precedence, Precedence.LOGICAL_AND);
				break;
			}

			case NodeKind.LOGICAL_OR: {
				this._emitBinary('||', node, precedence, Precedence.LOGICAL_OR);
				break;
			}

			case NodeKind.LOGICAL_XOR: {
				this._emitBinary('^^', node, precedence, Precedence.LOGICAL_XOR);
				break;
			}

			case NodeKind.MULTIPLY: {
				this._emitBinary('*', node, precedence, Precedence.MULTIPLY);
				break;
			}

			case NodeKind.NOT_EQUAL: {
				this._emitBinary('!=', node, precedence, Precedence.COMPARE);
				break;
			}

			case NodeKind.SUBTRACT: {
				this._emitBinary('-', node, precedence, Precedence.ADD);
				break;
			}

			case NodeKind.ASSIGN: {
				this._emitBinary('=', node, precedence, Precedence.ASSIGN);
				break;
			}

			case NodeKind.ASSIGN_ADD: {
				this._emitBinary('+=', node, precedence, Precedence.ASSIGN);
				break;
			}

			case NodeKind.ASSIGN_DIVIDE: {
				this._emitBinary('/=', node, precedence, Precedence.ASSIGN);
				break;
			}

			case NodeKind.ASSIGN_MULTIPLY: {
				this._emitBinary('*=', node, precedence, Precedence.ASSIGN);
				break;
			}

			case NodeKind.ASSIGN_SUBTRACT: {
				this._emitBinary('-=', node, precedence, Precedence.ASSIGN);
				break;
			}

			default: {
				this._code += NodeKind[node.kind];
				break;
			}
		}
	}

	protected _emitUnaryPrefix(operator: string, node: Node, precedence: Precedence): void {
		const value = node.unaryValue();
		const kind = value.kind;
		this._code += operator;

		if (
			(operator.charCodeAt(0) === 45 && (kind === NodeKind.NEGATIVE || kind === NodeKind.PREFIX_DECREMENT || value.isNumberLessThanZero())) ||
			(operator.charCodeAt(0) === 43 && (kind === NodeKind.POSITIVE || kind === NodeKind.PREFIX_INCREMENT))
		) {
			this._code += ' ';
		}

		this._emitNodePrecedence(value, Precedence.UNARY_PREFIX);
	}

	protected _emitUnaryPostfix(operator: string, node: Node, precedence: Precedence): void {
		this._emitNodePrecedence(node.unaryValue(), Precedence.UNARY_POSTFIX);
		this._code += operator;
	}

	protected _emitBinary(operator: string, node: Node, outer: Precedence, inner: Precedence): void {
		const isRightAssociative = NodeKind_isBinaryAssign(node.kind);

		if (inner < outer) {
			this._code += '(';
		}

		this._emitNodePrecedence(node.binaryLeft(), inner + (isRightAssociative ? 1 : 0));
		this._code += this._space + operator + this._space;
		this._emitNodePrecedence(node.binaryRight(), inner + (!isRightAssociative ? 1 : 0));

		if (inner < outer) {
			this._code += ')';
		}
	}

	protected _emitString(text: string): void {
		this._code += text;
	}

	public toString(): string {
		return this._code;
	}

	static emit(global: Node, options: CompilerOptions): string {
		return new Emitter(global, options).toString();
	}

	static _shouldSeparateWithExtraNewline(before: Node, after: Node): boolean {
		return (
			Emitter._isFunctionWithBlock(before) ||
			Emitter._isFunctionWithBlock(after) ||
			(before.kind !== after.kind &&
				(before.kind === NodeKind.PRECISION || after.kind === NodeKind.PRECISION || before.kind === NodeKind.EXTENSION || after.kind === NodeKind.EXTENSION))
		);
	}

	static _isFunctionWithBlock(node: Node): boolean {
		return node.kind === NodeKind.FUNCTION && !!node.symbol.asFunction().block;
	}

	static floatToString(value: number, mode: Emitter.EmitMode): string {
		let text = value.toString();

		// Check to see if exponential form is smaller
		const exponential: string = value.toExponential();

		if (exponential.length < text.length) {
			text = exponential;
		}

		// Strip off the exponent
		const e = text.indexOf('e');
		let exponent = '';

		if (e !== -1) {
			exponent = text.slice(e);
			text = text.slice(0, e);
		}

		// 32-bit floating point only needs six digits
		text = (+(+text).toFixed(6)).toString();

		// Make sure there's a dot if there isn't an exponent
		if (exponent === '' && !(text.indexOf('.') !== -1)) {
			text += mode === Emitter.EmitMode.MINIFIED ? '.' : '.0';
		}

		// Strip the leading zero
		if (mode === Emitter.EmitMode.MINIFIED && text.startsWith('0.') && text !== '0.') {
			text = text.slice(1);
		}

		// Strip the leading zero with a minus sign
		if (mode === Emitter.EmitMode.MINIFIED && text.startsWith('-0.') && text !== '-0.') {
			text = '-' + text.slice(2);
		}

		// Put the exponent back
		return text + exponent;
	}
}

export namespace Emitter {
	export const enum EmitMode {
		NORMAL,
		MINIFIED,
	}

	export const enum After {
		AFTER_KEYWORD,
		AFTER_PARENTHESIS,
	}
}
