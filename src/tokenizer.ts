import { Log } from './log.js';
import { Range } from './range.js';
import { Source } from './source.js';

export enum TokenKind {
	SINGLE_LINE_COMMENT,
	MULTI_LINE_COMMENT,

	// Standard keywords
	ATTRIBUTE,
	BOOL,
	BREAK,
	BVEC2,
	BVEC3,
	BVEC4,
	CONST,
	CONTINUE,
	DISCARD,
	DO,
	ELSE,
	FALSE,
	FLOAT,
	FOR,
	HIGHP,
	IF,
	IN,
	INOUT,
	INT,
	INVARIANT,
	IVEC2,
	IVEC3,
	IVEC4,
	LOWP,
	MAT2,
	MAT3,
	MAT4,
	MEDIUMP,
	OUT,
	PRECISION,
	RETURN,
	SAMPLER2D,
	SAMPLERCUBE,
	STRUCT,
	TRUE,
	UNIFORM,
	VARYING,
	VEC2,
	VEC3,
	VEC4,
	VOID,
	WHILE,

	// Non-standard keywords
	EXPORT,
	IMPORT,

	// Unary
	COMPLEMENT,
	DECREMENT,
	INCREMENT,
	NOT,

	// Binary
	BITWISE_AND,
	BITWISE_OR,
	BITWISE_XOR,
	DIVIDE,
	EQUAL,
	GREATER_THAN,
	GREATER_THAN_OR_EQUAL,
	LESS_THAN,
	LESS_THAN_OR_EQUAL,
	LOGICAL_AND,
	LOGICAL_OR,
	LOGICAL_XOR,
	MINUS,
	MULTIPLY,
	NOT_EQUAL,
	PLUS,
	REMAINDER,
	SHIFT_LEFT,
	SHIFT_RIGHT,

	// Binary assignment
	ASSIGN,
	ASSIGN_ADD,
	ASSIGN_BITWISE_AND,
	ASSIGN_BITWISE_OR,
	ASSIGN_BITWISE_XOR,
	ASSIGN_DIVIDE,
	ASSIGN_MULTIPLY,
	ASSIGN_REMAINDER,
	ASSIGN_SHIFT_LEFT,
	ASSIGN_SHIFT_RIGHT,
	ASSIGN_SUBTRACT,

	// Other operators
	COLON,
	COMMA,
	DOT,
	LEFT_BRACE,
	LEFT_BRACKET,
	LEFT_PARENTHESIS,
	QUESTION,
	RIGHT_BRACE,
	RIGHT_BRACKET,
	RIGHT_PARENTHESIS,
	SEMICOLON,

	// Pragmas
	EXTENSION,
	VERSION,
	INCLUDE,
	PRAGMA,

	// Literals
	FLOAT_LITERAL,
	IDENTIFIER,
	INT_LITERAL,
	STRING_LITERAL,

	// This is always at the end of the token stream
	EOF,
}

export class Token {
	range: Range;
	kind: TokenKind;
	comments: Range[];

	constructor(range: Range, kind: TokenKind, comments: Range[]) {
		this.range = range;
		this.kind = kind;
		this.comments = comments;
	}
}

export const enum TokenPurpose {
	COMPILE,
	FORMAT,
}

export function tokenize(log: Log, source: Source, purpose: TokenPurpose): Token[] {
	const parts: string[] = source.contents.split(_tokenRegex);
	const tokens: Token[] = [];
	let comments: Range[];
	let prevCommentTokenCount = 0;
	let start = 0;

	for (let i = 0, count1 = parts.length; i < count1; i++) {
		const part = parts[i];
		const count = part.length;
		const end = start + count;
		const range = new Range(source, start, end);

		if (i % 2 !== 0) {
			const c = part.charCodeAt(0);

			// Identifier
			if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) {
				const keyword = keywords.get(part) ?? TokenKind.EOF;

				if (keyword !== TokenKind.EOF) {
					tokens.push(new Token(range, keyword, comments));
				} else if (reservedWords.has(part)) {
					log.syntaxErrorReservedWord(range);
				} else {
					tokens.push(new Token(range, TokenKind.IDENTIFIER, comments));
				}
			}

			// Number
			else if ((c >= 48 && c <= 57) || (c === 46 && count > 1)) {
				tokens.push(new Token(range, _intRegex.test(part) ? TokenKind.INT_LITERAL : TokenKind.FLOAT_LITERAL, comments));
			}

			// Pragma
			else if (c === 35) {
				let kind = TokenKind.PRAGMA;
				const value = part;

				if (value === '#version') {
					kind = TokenKind.VERSION;
				} else if (value === '#extension') {
					kind = TokenKind.EXTENSION;
				} else if (value === '#include') {
					kind = TokenKind.INCLUDE;
				}

				tokens.push(new Token(range, kind, comments));
			}

			// String literal
			else if (c === 34) {
				tokens.push(new Token(range, TokenKind.STRING_LITERAL, comments));
			}

			// Operator
			else {
				let kind1 = operators.get(part) ?? TokenKind.EOF;

				if (kind1 === TokenKind.EOF) {
					if (part.startsWith('//')) {
						if (purpose === TokenPurpose.FORMAT) {
							kind1 = TokenKind.SINGLE_LINE_COMMENT;
						} else {
							(comments ? comments : (comments = [])).push(range);
						}
					} else if (part.startsWith('/*')) {
						if (purpose === TokenPurpose.FORMAT) {
							kind1 = TokenKind.MULTI_LINE_COMMENT;
						} else {
							(comments ? comments : (comments = [])).push(range);
						}
					}
				}

				if (kind1 !== TokenKind.EOF) {
					tokens.push(new Token(range, kind1, comments));
				}
			}
		} else if (part !== '') {
			log.syntaxErrorExtraData(range, part);
			break;
		}

		// Reset the comment list after every non-comment token
		if (tokens.length !== prevCommentTokenCount) {
			comments = null;
			prevCommentTokenCount = tokens.length;
		}

		start = end;
	}

	tokens.push(new Token(new Range(source, start, start), TokenKind.EOF, comments));
	return tokens;
}

export function TokenKind_isBinaryOperator(self: TokenKind): boolean {
	return self >= TokenKind.BITWISE_AND && self <= TokenKind.ASSIGN_SUBTRACT;
}

export function TokenKind_isIdentifierOrType(self: TokenKind): boolean {
	switch (self) {
		case TokenKind.IDENTIFIER:
		case TokenKind.VOID:
		case TokenKind.SAMPLER2D:
		case TokenKind.SAMPLERCUBE:
		case TokenKind.FLOAT:
		case TokenKind.VEC2:
		case TokenKind.VEC3:
		case TokenKind.VEC4:
		case TokenKind.INT:
		case TokenKind.IVEC2:
		case TokenKind.IVEC3:
		case TokenKind.IVEC4:
		case TokenKind.BOOL:
		case TokenKind.BVEC2:
		case TokenKind.BVEC3:
		case TokenKind.BVEC4:
		case TokenKind.MAT2:
		case TokenKind.MAT3:
		case TokenKind.MAT4: {
			return true;
		}
	}

	return false;
}

// The order matters here due to greedy matching
export const _tokenRegex: any = new RegExp(
	'(' +
		// Float literal
		'\\.[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'\\.[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		'[0-9]+\\.|' + // Floating-point constant
		'[0-9]+[eE][+-]?[0-9]+\\b|' + // Floating-point constant
		// Int literals
		'[1-9][0-9]*\\b|' + // Decimal int literal
		'0[0-7]*\\b|' + // Octal int literal
		'0[xX][0-9A-Fa-f]+\\b|' + // Hexadecimal int literal
		// Other
		'[ \t\r\n]|' + // Whitespace
		'/\\*(?:.|\r\n|\n)*?\\*/|' + // Multi-line comment
		'//.*|' + // Single-line comment
		'&&|\\|\\||\\^\\^|\\+\\+|--|<<=?|>>=?|[()[\\]{}\\.,?:;]|[+\\-*/%=!<>&|^~]=?|' + // Operator
		'[A-Za-z_][A-Za-z0-9_]*\\b|' + // Identifier
		'#\\w+\\b|' + // Pragma
		'"(?:[^"\\\\]|\\\\.)*"' + // String literal
		')'
);
export const _intRegex: any = new RegExp('^(' + '[1-9][0-9]*|' + '0[0-7]*|' + '0[xX][0-9A-Fa-f]+' + ')$');

export const keywords = new Map();
keywords.set('attribute', TokenKind.ATTRIBUTE);
keywords.set('bool', TokenKind.BOOL);
keywords.set('break', TokenKind.BREAK);
keywords.set('bvec2', TokenKind.BVEC2);
keywords.set('bvec3', TokenKind.BVEC3);
keywords.set('bvec4', TokenKind.BVEC4);
keywords.set('const', TokenKind.CONST);
keywords.set('continue', TokenKind.CONTINUE);
keywords.set('discard', TokenKind.DISCARD);
keywords.set('do', TokenKind.DO);
keywords.set('else', TokenKind.ELSE);
keywords.set('false', TokenKind.FALSE);
keywords.set('float', TokenKind.FLOAT);
keywords.set('for', TokenKind.FOR);
keywords.set('highp', TokenKind.HIGHP);
keywords.set('if', TokenKind.IF);
keywords.set('in', TokenKind.IN);
keywords.set('inout', TokenKind.INOUT);
keywords.set('int', TokenKind.INT);
keywords.set('invariant', TokenKind.INVARIANT);
keywords.set('ivec2', TokenKind.IVEC2);
keywords.set('ivec3', TokenKind.IVEC3);
keywords.set('ivec4', TokenKind.IVEC4);
keywords.set('lowp', TokenKind.LOWP);
keywords.set('mat2', TokenKind.MAT2);
keywords.set('mat3', TokenKind.MAT3);
keywords.set('mat4', TokenKind.MAT4);
keywords.set('mediump', TokenKind.MEDIUMP);
keywords.set('out', TokenKind.OUT);
keywords.set('precision', TokenKind.PRECISION);
keywords.set('return', TokenKind.RETURN);
keywords.set('sampler2D', TokenKind.SAMPLER2D);
keywords.set('samplerCube', TokenKind.SAMPLERCUBE);
keywords.set('struct', TokenKind.STRUCT);
keywords.set('true', TokenKind.TRUE);
keywords.set('uniform', TokenKind.UNIFORM);
keywords.set('varying', TokenKind.VARYING);
keywords.set('vec2', TokenKind.VEC2);
keywords.set('vec3', TokenKind.VEC3);
keywords.set('vec4', TokenKind.VEC4);
keywords.set('void', TokenKind.VOID);
keywords.set('while', TokenKind.WHILE);
keywords.set('export', TokenKind.EXPORT);
keywords.set('import', TokenKind.IMPORT);
export const operators = new Map();
operators.set('~', TokenKind.COMPLEMENT);
operators.set('--', TokenKind.DECREMENT);
operators.set('++', TokenKind.INCREMENT);
operators.set('!', TokenKind.NOT);
operators.set('&', TokenKind.BITWISE_AND);
operators.set('|', TokenKind.BITWISE_OR);
operators.set('^', TokenKind.BITWISE_XOR);
operators.set('/', TokenKind.DIVIDE);
operators.set('==', TokenKind.EQUAL);
operators.set('>', TokenKind.GREATER_THAN);
operators.set('>=', TokenKind.GREATER_THAN_OR_EQUAL);
operators.set('<', TokenKind.LESS_THAN);
operators.set('<=', TokenKind.LESS_THAN_OR_EQUAL);
operators.set('&&', TokenKind.LOGICAL_AND);
operators.set('||', TokenKind.LOGICAL_OR);
operators.set('^^', TokenKind.LOGICAL_XOR);
operators.set('-', TokenKind.MINUS);
operators.set('*', TokenKind.MULTIPLY);
operators.set('!=', TokenKind.NOT_EQUAL);
operators.set('+', TokenKind.PLUS);
operators.set('%', TokenKind.REMAINDER);
operators.set('<<', TokenKind.SHIFT_LEFT);
operators.set('>>', TokenKind.SHIFT_RIGHT);
operators.set('=', TokenKind.ASSIGN);
operators.set('+=', TokenKind.ASSIGN_ADD);
operators.set('&=', TokenKind.ASSIGN_BITWISE_AND);
operators.set('|=', TokenKind.ASSIGN_BITWISE_OR);
operators.set('^=', TokenKind.ASSIGN_BITWISE_XOR);
operators.set('/=', TokenKind.ASSIGN_DIVIDE);
operators.set('*=', TokenKind.ASSIGN_MULTIPLY);
operators.set('%=', TokenKind.ASSIGN_REMAINDER);
operators.set('<<=', TokenKind.ASSIGN_SHIFT_LEFT);
operators.set('>>=', TokenKind.ASSIGN_SHIFT_RIGHT);
operators.set('-=', TokenKind.ASSIGN_SUBTRACT);
operators.set(':', TokenKind.COLON);
operators.set(',', TokenKind.COMMA);
operators.set('.', TokenKind.DOT);
operators.set('{', TokenKind.LEFT_BRACE);
operators.set('[', TokenKind.LEFT_BRACKET);
operators.set('(', TokenKind.LEFT_PARENTHESIS);
operators.set('?', TokenKind.QUESTION);
operators.set('}', TokenKind.RIGHT_BRACE);
operators.set(']', TokenKind.RIGHT_BRACKET);
operators.set(')', TokenKind.RIGHT_PARENTHESIS);
operators.set(';', TokenKind.SEMICOLON);
export const reservedWords = new Map();
reservedWords.set('asm', 0);
reservedWords.set('cast', 0);
reservedWords.set('class', 0);
reservedWords.set('default', 0);
reservedWords.set('double', 0);
reservedWords.set('dvec2', 0);
reservedWords.set('dvec3', 0);
reservedWords.set('dvec4', 0);
reservedWords.set('enum', 0);
reservedWords.set('extern', 0);
reservedWords.set('external', 0);
reservedWords.set('fixed', 0);
reservedWords.set('flat', 0);
reservedWords.set('fvec2', 0);
reservedWords.set('fvec3', 0);
reservedWords.set('fvec4', 0);
reservedWords.set('goto', 0);
reservedWords.set('half', 0);
reservedWords.set('hvec2', 0);
reservedWords.set('hvec3', 0);
reservedWords.set('hvec4', 0);
reservedWords.set('inline', 0);
reservedWords.set('input', 0);
reservedWords.set('interface', 0);
reservedWords.set('long', 0);
reservedWords.set('namespace', 0);
reservedWords.set('noinline', 0);
reservedWords.set('output', 0);
reservedWords.set('packed', 0);
reservedWords.set('public', 0);
reservedWords.set('sampler1D', 0);
reservedWords.set('sampler1DShadow', 0);
reservedWords.set('sampler2DRect', 0);
reservedWords.set('sampler2DRectShadow', 0);
reservedWords.set('sampler2DShadow', 0);
reservedWords.set('sampler3D', 0);
reservedWords.set('sampler3DRect', 0);
reservedWords.set('short', 0);
reservedWords.set('sizeof', 0);
reservedWords.set('static', 0);
reservedWords.set('superp', 0);
reservedWords.set('switch', 0);
reservedWords.set('template', 0);
reservedWords.set('this', 0);
reservedWords.set('typedef', 0);
reservedWords.set('union', 0);
reservedWords.set('unsigned', 0);
reservedWords.set('using', 0);
reservedWords.set('volatile', 0);
