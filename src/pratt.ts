import { CompilerData } from './compiler.js';
import { Log } from './log.js';
import { Node } from './node.js';
import { Range } from './range.js';
import { Resolver } from './resolver.js';
import { Scope } from './scope.js';
import { SymbolFlags } from './symbol.js';
import { Token, TokenKind } from './tokenizer.js';

// The same operator precedence as C for the most part
export const enum Precedence {
	LOWEST,
	COMMA,
	ASSIGN,
	LOGICAL_OR,
	LOGICAL_XOR,
	LOGICAL_AND,
	BITWISE_OR,
	BITWISE_XOR,
	BITWISE_AND,
	COMPARE = 10,
	SHIFT,
	ADD,
	MULTIPLY,
	UNARY_PREFIX,
	UNARY_POSTFIX,
	MEMBER,
}

export class Include {
	originalRange: Range;
	includedRange: Range;

	constructor(originalRange: Range, includedRange: Range) {
		this.originalRange = originalRange;
		this.includedRange = includedRange;
	}
}

export class ParserContext {
	log: Log;
	_tokens: Token[];
	compilationData: CompilerData;
	resolver: Resolver;
	processedIncludes: Map<string, boolean>;
	includes: Include[];
	flags: SymbolFlags;
	_index: number;
	_scope: Scope;

	current(): Token {
		return this._tokens[this._index];
	}

	next(): Token {
		const token = this.current();

		if (this._index + 1 < this._tokens.length) {
			this._index = this._index + 1;
		}

		return token;
	}

	spanSince(range: Range): Range {
		const previous = this._tokens[this._index > 0 ? this._index - 1 : 0];
		return previous.range.end < range.start ? range : Range.span(range, previous.range);
	}

	peek(kind: TokenKind): boolean {
		return this.current().kind === kind;
	}

	eat(kind: TokenKind): boolean {
		if (this.peek(kind)) {
			this.next();
			return true;
		}

		return false;
	}

	expect(kind: TokenKind): boolean {
		if (this.eat(kind)) {
			return true;
		}

		const token = this.current();
		const range = token.range;
		const previous = (this._index > 0 ? this._tokens[this._index - 1] : token).range;

		// Put errors about missing semicolons and about tokens on the next line
		// after the previous token instead of at the next token
		if (kind === TokenKind.SEMICOLON || previous.lineColumn().line !== range.lineColumn().line) {
			this.log.syntaxErrorExpectedToken1(previous.rangeAtEnd(), kind);
		} else {
			this.log.syntaxErrorExpectedToken2(range, token.kind, kind);
		}

		return false;
	}

	unexpectedToken(): void {
		this.log.syntaxErrorUnexpectedToken(this.current());
	}

	scope(): Scope {
		return this._scope;
	}

	pushScope(newScope: Scope): void {
		console.assert(newScope.parent === this._scope);
		this._scope = newScope;
	}

	popScope(): void {
		console.assert(this._scope);
		this._scope = this._scope.parent;
	}

	constructor(log: Log, _tokens: Token[], compilationData: CompilerData, resolver: Resolver, processedIncludes: Map<string, boolean>) {
		this.log = log;
		this._tokens = _tokens;
		this.compilationData = compilationData;
		this.resolver = resolver;
		this.processedIncludes = processedIncludes;
		this.includes = [];
		this.flags = 0 as SymbolFlags;
		this._index = 0;
		this._scope;
	}
}

export class Parselet {
	precedence: Precedence;
	prefix: (v0: ParserContext) => Node;
	infix: (v0: ParserContext, v1: Node) => Node;

	constructor(precedence: Precedence) {
		this.precedence = precedence;
	}
}

// A Pratt parser is a parser that associates up to two operations per token,
// each with its own precedence. Pratt parsers excel at parsing expression
// trees with deeply nested precedence levels. For an excellent writeup, see:
//
//   http://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/
//
export class Pratt {
	_table: Map<number, Parselet>;

	parselet(kind: TokenKind, precedence: Precedence): Parselet {
		let parselet = this._table.get(kind);

		if (!parselet) {
			const created = new Parselet(precedence);
			parselet = created;
			this._table.set(kind, created);
		} else if (precedence > parselet.precedence) {
			parselet.precedence = precedence;
		}

		return parselet;
	}

	parse(context: ParserContext, precedence: Precedence): Node {
		const token = context.current();
		const parselet = this._table.get(token.kind);

		if (!parselet || !parselet.prefix) {
			context.unexpectedToken();
			return;
		}

		const node = this.resume(context, precedence, parselet.prefix(context));

		console.assert(!node || node.range); // Parselets must set the range of every node
		return node;
	}

	resume(context: ParserContext, precedence: Precedence, left: Node): Node {
		while (left) {
			const kind = context.current().kind;
			const parselet = this._table.get(kind);

			if (!parselet || !parselet.infix || parselet.precedence <= precedence) {
				break;
			}

			left = parselet.infix(context, left);

			console.assert(!left || left.range); // Parselets must set the range of every node
		}

		return left;
	}

	literal(kind: TokenKind, callback: (v0: ParserContext, v1: Token) => Node): void {
		this.parselet(kind, Precedence.LOWEST).prefix = (context: ParserContext) => {
			return callback(context, context.next());
		};
	}

	prefix(kind: TokenKind, precedence: Precedence, callback: (v0: ParserContext, v1: Token, v2: Node) => Node): void {
		this.parselet(kind, Precedence.LOWEST).prefix = (context: ParserContext) => {
			const token = context.next();
			const value = this.parse(context, precedence);
			return value ? callback(context, token, value) : null;
		};
	}

	postfix(kind: TokenKind, precedence: Precedence, callback: (v0: ParserContext, v1: Node, v2: Token) => Node): void {
		this.parselet(kind, precedence).infix = (context: ParserContext, left: Node) => {
			return callback(context, left, context.next());
		};
	}

	infix(kind: TokenKind, precedence: Precedence, callback: (v0: ParserContext, v1: Node, v2: Token, v3: Node) => Node): void {
		this.parselet(kind, precedence).infix = (context: ParserContext, left: Node) => {
			const token = context.next();
			const right = this.parse(context, precedence);
			return right ? callback(context, left, token, right) : null;
		};
	}

	infixRight(kind: TokenKind, precedence: Precedence, callback: (v0: ParserContext, v1: Node, v2: Token, v3: Node) => Node): void {
		this.parselet(kind, precedence).infix = (context: ParserContext, left: Node) => {
			const token = context.next();

			const right = this.parse(context, precedence - 1); // Subtract 1 for right-associativity
			return right ? callback(context, left, token, right) : null;
		};
	}

	constructor() {
		this._table = new Map();
	}
}
