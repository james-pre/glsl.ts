import { CompilerOptions, ExtensionBehavior } from './compiler.js';
import { Node, NodeKind, NodeKind_isBinaryAssign, NodeKind_isExpression, NodeKind_isStatement, NodeKind_isUnaryPrefix } from './node.js';
import { Precedence } from './pratt.js';
import { SymbolFlags, SymbolFlags_toString, VariableSymbol } from './symbol.js';

export class Emitter {
	_code: string;
	_indent: string;
	_newline: string;
	_space: string;
	_removeWhitespace: boolean;

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
		return node.kind === NodeKind.FUNCTION && node.symbol.asFunction().block !== null;
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

	constructor(node: Node, options: CompilerOptions) {
		this._code = '';
		this._indent = '';
		this._newline = '\n';
		this._space = ' ';
		this._removeWhitespace = false;
		this._removeWhitespace = options.removeWhitespace;

		if (this._removeWhitespace) {
			this._space = '';
			this._newline = '';
		}

		let previous: Node = null;

		for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
			if (this._isImportedNode(child)) {
				continue;
			}

			if (previous !== null && Emitter._shouldSeparateWithExtraNewline(previous, child)) {
				this._emit4(this._newline);
			}

			this._emit1(child);
			this._emit4(this._newline);
			previous = child;
		}
	}

	_isImportedNode(node: Node): boolean {
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

	_increaseIndent(): void {
		if (!this._removeWhitespace) {
			this._indent += '  ';
		}
	}

	_decreaseIndent(): void {
		if (!this._removeWhitespace) {
			this._indent = this._indent.slice(2);
		}
	}

	_emit1(node: Node): void {
		console.assert(NodeKind_isStatement(node.kind));

		switch (node.kind) {
			case NodeKind.BLOCK: {
				if (!node.hasChildren() && node.parent() !== null) {
					this._emit4(';');
				} else {
					this._emit4('{' + this._newline);
					this._increaseIndent();

					for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
						this._emit4(this._indent);
						this._emit1(child);
						this._emit4(this._newline);
					}

					this._decreaseIndent();
					this._emit4(this._indent + '}');
				}
				break;
			}

			case NodeKind.BREAK: {
				this._emit4('break;');
				break;
			}

			case NodeKind.CONTINUE: {
				this._emit4('continue;');
				break;
			}

			case NodeKind.DISCARD: {
				this._emit4('discard;');
				break;
			}

			case NodeKind.DO_WHILE: {
				this._emit4('do');
				this._emitBody(node.doWhileBody(), Emitter.After.AFTER_KEYWORD);
				this._emit4(this._newline + this._indent + 'while' + this._space + '(');
				this._emit3(node.doWhileTest(), Precedence.LOWEST);
				this._emit4(');');
				break;
			}

			case NodeKind.EXPRESSION: {
				this._emit3(node.expressionValue(), Precedence.LOWEST);
				this._emit4(';');
				break;
			}

			case NodeKind.EXTENSION: {
				this._emitNewlineBeforePragma();
				this._emit4('#extension ' + node.extensionName() + this._space + ':' + this._space);

				switch (node.extensionBehavior()) {
					case ExtensionBehavior.DISABLE: {
						this._emit4('disable');
						break;
					}

					case ExtensionBehavior.ENABLE: {
						this._emit4('enable');
						break;
					}

					case ExtensionBehavior.REQUIRE: {
						this._emit4('require');
						break;
					}

					case ExtensionBehavior.WARN: {
						this._emit4('warn');
						break;
					}
				}

				this._emitNewlineAfterPragma();
				break;
			}

			case NodeKind.FOR: {
				this._emit4('for' + this._space + '(');

				if (node.forSetup() !== null) {
					if (node.forSetup().kind === NodeKind.VARIABLES) {
						this._emit1(node.forSetup());
					} else {
						this._emit3(node.forSetup(), Precedence.LOWEST);
						this._emit4(';');
					}
				} else {
					this._emit4(';');
				}

				if (node.forTest() !== null) {
					this._emit4(this._space);
					this._emit3(node.forTest(), Precedence.LOWEST);
				}

				this._emit4(';');

				if (node.forUpdate() !== null) {
					this._emit4(this._space);
					this._emit3(node.forUpdate(), Precedence.LOWEST);
				}

				this._emit4(')');
				this._emitBody(node.forBody(), Emitter.After.AFTER_PARENTHESIS);
				break;
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();
				this._emit4(SymbolFlags_toString(_function.flags));
				this._emit3(_function.returnType, Precedence.LOWEST);
				this._emit4(' ');
				this._emit4(_function.name);
				this._emit4('(');

				for (const argument of _function._arguments) {
					if (argument !== _function._arguments[0]) {
						this._emit4(',' + this._space);
					}

					this._emit4(SymbolFlags_toString(argument.flags));
					this._emit3(argument.type, Precedence.LOWEST);
					this._emit4(' ');
					this._emit2(argument);
				}

				this._emit4(')');

				if (_function.block !== null) {
					this._emit4(this._space);
					this._emit1(_function.block);
				} else {
					this._emit4(';');
				}
				break;
			}

			case NodeKind.IF: {
				this._emit4('if' + this._space + '(');
				this._emit3(node.ifTest(), Precedence.LOWEST);
				this._emit4(')');
				this._emitBody(node.ifTrue(), Emitter.After.AFTER_PARENTHESIS);

				if (node.ifFalse() !== null) {
					this._emit4(this._newline + this._indent + 'else');

					if (node.ifFalse().kind === NodeKind.IF) {
						this._emit4(' ');
						this._emit1(node.ifFalse());
					} else {
						this._emitBody(node.ifFalse(), Emitter.After.AFTER_KEYWORD);
					}
				}
				break;
			}

			case NodeKind.PRECISION: {
				this._emit4('precision ');
				this._emit4(SymbolFlags_toString(node.precisionFlag()));
				this._emit3(node.precisionType(), Precedence.LOWEST);
				this._emit4(';');
				break;
			}

			case NodeKind.RETURN: {
				const value = node.returnValue();
				this._emit4('return');

				if (value !== null) {
					if (!NodeKind_isUnaryPrefix(value.kind)) {
						this._emit4(' ');
					}

					this._emit3(value, Precedence.LOWEST);
				}

				this._emit4(';');
				break;
			}

			case NodeKind.STRUCT: {
				const symbol = node.symbol.asStruct();
				this._emit4(SymbolFlags_toString(symbol.flags));
				this._emit4('struct ' + symbol.name + this._space + '{' + this._newline);
				this._increaseIndent();

				for (let child1 = node.structBlock().firstChild(); child1 !== null; child1 = child1.nextSibling()) {
					console.assert(child1.kind === NodeKind.VARIABLES);
					this._emit4(this._indent);
					this._emit1(child1);
					this._emit4(this._newline);
				}

				this._decreaseIndent();
				this._emit4(this._indent + '}');

				if (node.structVariables() !== null) {
					for (let child2 = node.structVariables().variablesType().nextSibling(); child2 !== null; child2 = child2.nextSibling()) {
						console.assert(child2.kind === NodeKind.VARIABLE);
						this._emit4(child2.previousSibling().previousSibling() === null ? this._space : ',' + this._space);
						this._emit2(child2.symbol.asVariable());
					}
				}

				this._emit4(';');
				break;
			}

			case NodeKind.VARIABLES: {
				this._emit4(SymbolFlags_toString(node.variablesFlags()));
				this._emit3(node.variablesType(), Precedence.LOWEST);

				for (let child3 = node.variablesType().nextSibling(); child3 !== null; child3 = child3.nextSibling()) {
					const variable = child3.symbol.asVariable();
					this._emit4(child3.previousSibling().previousSibling() === null ? ' ' : ',' + this._space);
					this._emit2(variable);
				}

				this._emit4(';');
				break;
			}

			case NodeKind.VERSION: {
				this._emitNewlineBeforePragma();
				this._emit4('#version ' + node.versionNumber().toString());
				this._emitNewlineAfterPragma();
				break;
			}

			case NodeKind.WHILE: {
				this._emit4('while' + this._space + '(');
				this._emit3(node.whileTest(), Precedence.LOWEST);
				this._emit4(')');
				this._emitBody(node.whileBody(), Emitter.After.AFTER_PARENTHESIS);
				break;
			}

			default: {
				this._emit4(NodeKind[node.kind]);
				break;
			}
		}
	}

	_emitNewlineBeforePragma(): void {
		if (this._code !== '' && !this._code.endsWith('\n')) {
			this._emit4('\n');
		}
	}

	_emitNewlineAfterPragma(): void {
		if (this._removeWhitespace) {
			this._emit4('\n');
		}
	}

	_emitBody(node: Node, after: Emitter.After): void {
		if (node.kind === NodeKind.BLOCK) {
			this._emit4(this._space);
			this._emit1(node);
		} else {
			this._emit4(this._removeWhitespace && after === Emitter.After.AFTER_KEYWORD ? ' ' : this._newline);
			this._increaseIndent();
			this._emit4(this._indent);
			this._emit1(node);
			this._decreaseIndent();
		}
	}

	_emitCommaSeparatedExpressions(node: Node): void {
		for (let child = node; child !== null; child = child.nextSibling()) {
			if (child !== node) {
				this._emit4(',' + this._space);
			}

			this._emit3(child, Precedence.COMMA);
		}
	}

	_emit2(variable: VariableSymbol): void {
		this._emit4(variable.name);

		if (variable.arrayCount !== null) {
			this._emit4('[');
			this._emit3(variable.arrayCount, Precedence.LOWEST);
			this._emit4(']');
		}

		if (variable.value() !== null) {
			this._emit4(this._space + '=' + this._space);
			this._emit3(variable.value(), Precedence.COMMA);
		}
	}

	_emit3(node: Node, precedence: Precedence): void {
		console.assert(NodeKind_isExpression(node.kind));

		switch (node.kind) {
			case NodeKind.CALL: {
				this._emit3(node.callTarget(), Precedence.UNARY_POSTFIX);
				this._emit4('(');
				this._emitCommaSeparatedExpressions(node.callTarget().nextSibling());
				this._emit4(')');
				break;
			}

			case NodeKind.DOT: {
				this._emit3(node.dotTarget(), Precedence.MEMBER);
				this._emit4('.');
				this._emit4(node.symbol !== null ? node.symbol.name : node.asString());
				break;
			}

			case NodeKind.HOOK: {
				if (Precedence.ASSIGN < precedence) {
					this._emit4('(');
				}

				this._emit3(node.hookTest(), Precedence.LOGICAL_OR);
				this._emit4(this._space + '?' + this._space);
				this._emit3(node.hookTrue(), Precedence.ASSIGN);
				this._emit4(this._space + ':' + this._space);
				this._emit3(node.hookFalse(), Precedence.ASSIGN);

				if (Precedence.ASSIGN < precedence) {
					this._emit4(')');
				}
				break;
			}

			case NodeKind.NAME: {
				this._emit4(node.symbol.name);
				break;
			}

			case NodeKind.SEQUENCE: {
				if (Precedence.COMMA <= precedence) {
					this._emit4('(');
				}

				this._emitCommaSeparatedExpressions(node.firstChild());

				if (Precedence.COMMA <= precedence) {
					this._emit4(')');
				}
				break;
			}

			case NodeKind.TYPE: {
				this._emit4(node.resolvedType.rootType().symbol.name);
				break;
			}

			case NodeKind.BOOL: {
				this._emit4(node.asBool().toString());
				break;
			}

			case NodeKind.FLOAT: {
				this._emit4(Emitter.floatToString(node.asFloat(), this._removeWhitespace ? Emitter.EmitMode.MINIFIED : Emitter.EmitMode.NORMAL));
				break;
			}

			case NodeKind.INT: {
				this._emit4(node.asInt().toString());
				break;
			}

			case NodeKind.INDEX: {
				this._emit3(node.binaryLeft(), Precedence.MEMBER);
				this._emit4('[');
				this._emit3(node.binaryRight(), Precedence.LOWEST);
				this._emit4(']');
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
				this._emit4(NodeKind[node.kind]);
				break;
			}
		}
	}

	_emitUnaryPrefix(operator: string, node: Node, precedence: Precedence): void {
		const value = node.unaryValue();
		const kind = value.kind;
		this._emit4(operator);

		if (
			(operator.charCodeAt(0) === 45 && (kind === NodeKind.NEGATIVE || kind === NodeKind.PREFIX_DECREMENT || value.isNumberLessThanZero())) ||
			(operator.charCodeAt(0) === 43 && (kind === NodeKind.POSITIVE || kind === NodeKind.PREFIX_INCREMENT))
		) {
			this._emit4(' ');
		}

		this._emit3(value, Precedence.UNARY_PREFIX);
	}

	_emitUnaryPostfix(operator: string, node: Node, precedence: Precedence): void {
		this._emit3(node.unaryValue(), Precedence.UNARY_POSTFIX);
		this._emit4(operator);
	}

	_emitBinary(operator: string, node: Node, outer: Precedence, inner: Precedence): void {
		const isRightAssociative = NodeKind_isBinaryAssign(node.kind);

		if (inner < outer) {
			this._emit4('(');
		}

		this._emit3(node.binaryLeft(), inner + (isRightAssociative ? 1 : 0));
		this._emit4(this._space + operator + this._space);
		this._emit3(node.binaryRight(), inner + (!isRightAssociative ? 1 : 0));

		if (inner < outer) {
			this._emit4(')');
		}
	}

	_emit4(text: string): void {
		this._code += text;
	}

	toString(): string {
		return this._code;
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
